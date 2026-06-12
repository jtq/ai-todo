import { describe, expect, it } from "vitest";
import { ApiError } from "../domain/errors.js";
import { CommentService } from "./commentService.js";
import {
  makeComment,
  makeDatabaseMock,
  makeIdRepositoryMock,
  makeTask,
  MockCommentRepository,
  MockTaskRepository
} from "./serviceTestUtils.js";

function makeService(ids: string[] = ["C"]) {
  const database = makeDatabaseMock();
  const idRepo = makeIdRepositoryMock(ids);
  const taskRepo = new MockTaskRepository();
  const commentRepo = new MockCommentRepository();
  const service = new CommentService(database, idRepo, commentRepo.asRepository(), taskRepo.asRepository());
  return { database, idRepo, taskRepo, commentRepo, service };
}

function expectApiError(error: unknown, statusCode: number, code: string): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).statusCode).toBe(statusCode);
  expect((error as ApiError).code).toBe(code);
}

describe("CommentService", () => {
  it("throws not_found when creating for a missing task", () => {
    const { service } = makeService();

    try {
      service.create("missing", { body: "Progress update" });
      throw new Error("Expected service.create to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("creates a task-owned comment at the next position", () => {
    const { database, idRepo, taskRepo, commentRepo, service } = makeService(["D"]);
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    commentRepo.comments.set("C", makeComment({ id: "C", taskId: "1", position: 0 }));

    const created = service.create("1", { body: "Second update" });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(idRepo.next).toHaveBeenCalledWith("comment");
    expect(created).toEqual(expect.objectContaining({ id: "D", taskId: "1", position: 1, body: "Second update" }));
    expect(commentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ id: "D", taskId: "1", position: 1 }));
  });

  it("throws not_found when getting a missing comment", () => {
    const { service } = makeService();

    try {
      service.get("missing");
      throw new Error("Expected service.get to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("updates an existing comment", () => {
    const { commentRepo, service } = makeService();
    commentRepo.comments.set("C", makeComment({ id: "C", body: "Old" }));

    const updated = service.update("C", { body: "New" });

    expect(updated.body).toBe("New");
    expect(commentRepo.update).toHaveBeenCalledWith("C", expect.objectContaining({ body: "New" }));
  });

  it("throws not_found when updating a missing comment", () => {
    const { service } = makeService();

    try {
      service.update("missing", { body: "Nope" });
      throw new Error("Expected service.update to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("deletes a comment and normalizes positions for its owning task", () => {
    const { commentRepo, service } = makeService();
    commentRepo.comments.set("C", makeComment({ id: "C", taskId: "1", position: 0 }));
    commentRepo.comments.set("D", makeComment({ id: "D", taskId: "1", position: 1 }));

    service.delete("C");

    expect(commentRepo.delete).toHaveBeenCalledWith("C");
    expect(commentRepo.normalizePositions).toHaveBeenCalledWith("1");
  });

  it("throws not_found when deleting a missing comment", () => {
    const { service } = makeService();

    try {
      service.delete("missing");
      throw new Error("Expected service.delete to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws not_found when reordering comments for a missing task", () => {
    const { service } = makeService();

    try {
      service.reorder("missing", []);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws validation_error when reordering duplicate comment IDs", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.reorder("1", ["C", "C"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 422, "validation_error");
    }
  });

  it("throws conflict when reorder omits owned comments", () => {
    const { taskRepo, commentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    commentRepo.comments.set("C", makeComment({ id: "C", taskId: "1", position: 0 }));
    commentRepo.comments.set("D", makeComment({ id: "D", taskId: "1", position: 1 }));

    try {
      service.reorder("1", ["C"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws conflict when reorder includes a comment owned by another task", () => {
    const { taskRepo, commentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    taskRepo.tasks.set("2", makeTask({ id: "2" }));
    commentRepo.comments.set("C", makeComment({ id: "C", taskId: "1", position: 0 }));
    commentRepo.comments.set("D", makeComment({ id: "D", taskId: "2", position: 0 }));

    try {
      service.reorder("1", ["C", "D"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("reorders exactly the comments owned by a task", () => {
    const { taskRepo, commentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    commentRepo.comments.set("C", makeComment({ id: "C", taskId: "1", position: 0 }));
    commentRepo.comments.set("D", makeComment({ id: "D", taskId: "1", position: 1 }));

    const reordered = service.reorder("1", ["D", "C"]);

    expect(reordered.map((comment) => comment.id)).toEqual(["D", "C"]);
    expect(commentRepo.reorder).toHaveBeenCalledWith("1", ["D", "C"]);
  });
});

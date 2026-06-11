import { describe, expect, it } from "vitest";
import { ApiError } from "../domain/errors.js";
import { AttachmentService } from "./attachmentService.js";
import {
  makeAttachment,
  makeDatabaseMock,
  makeIdRepositoryMock,
  makeTask,
  MockAttachmentRepository,
  MockTaskRepository
} from "./serviceTestUtils.js";

function makeService(ids: string[] = ["A"]) {
  const database = makeDatabaseMock();
  const idRepo = makeIdRepositoryMock(ids);
  const taskRepo = new MockTaskRepository();
  const attachmentRepo = new MockAttachmentRepository();
  const service = new AttachmentService(database, idRepo, attachmentRepo.asRepository(), taskRepo.asRepository());
  return { database, idRepo, taskRepo, attachmentRepo, service };
}

function expectApiError(error: unknown, statusCode: number, code: string): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).statusCode).toBe(statusCode);
  expect((error as ApiError).code).toBe(code);
}

describe("AttachmentService", () => {
  it("throws not_found when creating for a missing task", () => {
    const { service } = makeService();

    try {
      service.create("missing", { description: "File", url: "file:///tmp/file.txt" });
      throw new Error("Expected service.create to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("creates a task-owned attachment at the next position", () => {
    const { database, idRepo, taskRepo, attachmentRepo, service } = makeService(["B"]);
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", taskId: "1", position: 0 }));

    const created = service.create("1", { description: "Second", url: "https://example.com/second", type: "text/plain" });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(idRepo.next).toHaveBeenCalledWith("attachment");
    expect(created).toEqual(expect.objectContaining({ id: "B", taskId: "1", position: 1, type: "text/plain" }));
    expect(attachmentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ id: "B", taskId: "1", position: 1 }));
  });

  it("throws not_found when getting a missing attachment", () => {
    const { service } = makeService();

    try {
      service.get("missing");
      throw new Error("Expected service.get to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("updates an existing attachment and clears nullable type", () => {
    const { attachmentRepo, service } = makeService();
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", type: "text/plain" }));

    const updated = service.update("A", { description: "Updated", type: null });

    expect(updated.description).toBe("Updated");
    expect(updated.type).toBeUndefined();
    expect(attachmentRepo.update).toHaveBeenCalledWith("A", expect.objectContaining({ description: "Updated", type: null }));
  });

  it("throws not_found when updating a missing attachment", () => {
    const { service } = makeService();

    try {
      service.update("missing", { description: "Nope" });
      throw new Error("Expected service.update to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("deletes an attachment and normalizes positions for its owning task", () => {
    const { attachmentRepo, service } = makeService();
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", taskId: "1", position: 0 }));
    attachmentRepo.attachments.set("B", makeAttachment({ id: "B", taskId: "1", position: 1 }));

    service.delete("A");

    expect(attachmentRepo.delete).toHaveBeenCalledWith("A");
    expect(attachmentRepo.normalizePositions).toHaveBeenCalledWith("1");
  });

  it("throws not_found when deleting a missing attachment", () => {
    const { service } = makeService();

    try {
      service.delete("missing");
      throw new Error("Expected service.delete to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws not_found when reordering attachments for a missing task", () => {
    const { service } = makeService();

    try {
      service.reorder("missing", []);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws validation_error when reordering duplicate attachment IDs", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.reorder("1", ["A", "A"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 422, "validation_error");
    }
  });

  it("throws conflict when reorder omits owned attachments", () => {
    const { taskRepo, attachmentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", taskId: "1", position: 0 }));
    attachmentRepo.attachments.set("B", makeAttachment({ id: "B", taskId: "1", position: 1 }));

    try {
      service.reorder("1", ["A"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws conflict when reorder includes an attachment owned by another task", () => {
    const { taskRepo, attachmentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    taskRepo.tasks.set("2", makeTask({ id: "2" }));
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", taskId: "1", position: 0 }));
    attachmentRepo.attachments.set("B", makeAttachment({ id: "B", taskId: "2", position: 0 }));

    try {
      service.reorder("1", ["A", "B"]);
      throw new Error("Expected service.reorder to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("reorders exactly the attachments owned by a task", () => {
    const { taskRepo, attachmentRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));
    attachmentRepo.attachments.set("A", makeAttachment({ id: "A", taskId: "1", position: 0 }));
    attachmentRepo.attachments.set("B", makeAttachment({ id: "B", taskId: "1", position: 1 }));

    const reordered = service.reorder("1", ["B", "A"]);

    expect(reordered.map((attachment) => attachment.id)).toEqual(["B", "A"]);
    expect(attachmentRepo.reorder).toHaveBeenCalledWith("1", ["B", "A"]);
  });
});

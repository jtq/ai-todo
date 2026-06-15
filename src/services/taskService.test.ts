import { describe, expect, it } from "vitest";
import { ApiError } from "../domain/errors.js";
import { TaskService } from "./taskService.js";
import { makeDatabaseMock, makeIdRepositoryMock, makeTask, MockTaskRepository } from "./serviceTestUtils.js";

function makeService(taskIds: string[] = ["1"]) {
  const database = makeDatabaseMock();
  const ids = makeIdRepositoryMock(taskIds);
  const taskRepo = new MockTaskRepository();
  const service = new TaskService(database, ids, taskRepo.asRepository());
  return { database, ids, taskRepo, service };
}

function expectApiError(error: unknown, statusCode: number, code: string): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).statusCode).toBe(statusCode);
  expect((error as ApiError).code).toBe(code);
}

describe("TaskService", () => {
  it("throws not_found when getting a missing task", () => {
    const { service } = makeService();

    expect(() => service.get("missing")).toThrow(ApiError);
    try {
      service.get("missing");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("creates a task inside a transaction and defaults completed manual progress to 1", () => {
    const { database, ids, taskRepo, service } = makeService(["1"]);

    const created = service.create({
      title: "Done",
      status: "completed",
      progressTracker: "manual",
      progress: 0,
      parentTaskId: undefined,
      childTaskIds: [],
      blockedByTaskIds: []
    });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(ids.next).toHaveBeenCalledWith("task");
    expect(taskRepo.create).toHaveBeenCalledOnce();
    expect(created.id).toBe("1");
    expect(created.completedAt).toMatch(/Z$/);
    expect(created.progress).toBe(1);
  });

  it("throws not_found when creating with a missing referenced task", () => {
    const { service } = makeService(["2"]);

    try {
      service.create({
        title: "Child",
        status: "todo",
        progressTracker: "manual",
        progress: 0,
        parentTaskId: "missing",
        childTaskIds: [],
        blockedByTaskIds: []
      });
      throw new Error("Expected service.create to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws conflict when create input references the generated task id as a parent", () => {
    const { taskRepo, service } = makeService(["1"]);
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.create({
        title: "Self parent",
        status: "todo",
        progressTracker: "manual",
        progress: 0,
        parentTaskId: "1",
        childTaskIds: [],
        blockedByTaskIds: []
      });
      throw new Error("Expected service.create to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws validation_error when updating progress on a computed task", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1", progressTracker: "computed_from_subtasks" }));

    try {
      service.update("1", { progress: 0.5 });
      throw new Error("Expected service.update to throw");
    } catch (error) {
      expectApiError(error, 422, "validation_error");
    }
  });

  it("switches a manual task to computed progress without clearing progress to null", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1", progressTracker: "manual", progress: 0.5 }));

    const updated = service.update("1", { progressTracker: "computed_from_subtasks" });

    expect(updated.progressTracker).toBe("computed_from_subtasks");
    const [, patch] = taskRepo.update.mock.calls[0];
    expect(patch).toEqual(expect.objectContaining({ progressTracker: "computed_from_subtasks" }));
    expect(patch).not.toHaveProperty("progress");
  });

  it("throws conflict when a task is updated to block itself", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.update("1", { blockedByTaskIds: ["1"] });
      throw new Error("Expected service.update to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws not_found when blocker updates reference a missing task", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.update("1", { blockedByTaskIds: ["missing"] });
      throw new Error("Expected service.update to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("clears completedAt when status moves away from completed", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1", status: "completed", completedAt: "2026-06-05T10:00:00.000Z", progress: 1 }));

    const updated = service.update("1", { status: "todo" });

    expect(updated.status).toBe("todo");
    expect(updated.completedAt).toBeUndefined();
    expect(taskRepo.update).toHaveBeenCalledWith("1", expect.objectContaining({ completedAt: null }));
  });

  it("allows transitions to on_hold and wont_do", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1", status: "todo" }));

    const onHold = service.update("1", { status: "on_hold" });
    expect(onHold.status).toBe("on_hold");

    const wontDo = service.update("1", { status: "wont_do" });
    expect(wontDo.status).toBe("wont_do");
  });

  it("adds and removes parent relationships reciprocally", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("parent", makeTask({ id: "parent" }));
    taskRepo.tasks.set("child", makeTask({ id: "child" }));

    const child = service.addParent("child", "parent");
    expect(child.parentTaskId).toBe("parent");
    expect(service.get("parent").childTaskIds).toEqual(["child"]);

    const detached = service.removeParent("child", "parent");
    expect(detached.parentTaskId).toBeUndefined();
    expect(service.get("parent").childTaskIds).toEqual([]);
  });

  it("replaces an existing parent when a new parent is set", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("old", makeTask({ id: "old", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("new", makeTask({ id: "new", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("child", makeTask({ id: "child" }));
    service.addParent("child", "old");

    const child = service.addParent("child", "new");

    expect(child.parentTaskId).toBe("new");
    expect(service.get("old").childTaskIds).toEqual([]);
    expect(service.get("new").childTaskIds).toEqual(["child"]);
  });

  it("throws not_found for relationship operations with missing tasks", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.addChild("1", "missing");
      throw new Error("Expected service.addChild to throw");
    } catch (error) {
      expectApiError(error, 404, "not_found");
    }
  });

  it("throws conflict for self parent-child relationships", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.addChild("1", "1");
      throw new Error("Expected service.addChild to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws conflict when adding a relationship would create a cycle", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("a", makeTask({ id: "a" }));
    taskRepo.tasks.set("b", makeTask({ id: "b" }));
    taskRepo.tasks.set("c", makeTask({ id: "c" }));
    taskRepo.addRelationship("a", "b");
    taskRepo.addRelationship("b", "c");

    try {
      service.addChild("c", "a");
      throw new Error("Expected service.addChild to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("throws conflict when a task blocks itself via addBlocker", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("1", makeTask({ id: "1" }));

    try {
      service.addBlocker("1", "1");
      throw new Error("Expected service.addBlocker to throw");
    } catch (error) {
      expectApiError(error, 409, "conflict");
    }
  });

  it("deletes a task and recomputes its parents", () => {
    const { taskRepo, service } = makeService();
    taskRepo.tasks.set("parent", makeTask({ id: "parent", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("child", makeTask({ id: "child" }));
    taskRepo.addRelationship("parent", "child");

    service.delete("child");

    expect(taskRepo.delete).toHaveBeenCalledWith("child");
    expect(taskRepo.update).toHaveBeenCalledWith("parent", expect.objectContaining({ progress: 0 }));
  });
});

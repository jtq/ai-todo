import { describe, expect, it } from "vitest";
import { ProgressService } from "./progressService.js";
import { makeTask, MockTaskRepository } from "./serviceTestUtils.js";

describe("ProgressService", () => {
  it("does nothing for missing tasks", () => {
    const taskRepo = new MockTaskRepository();
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeIfComputed("missing");

    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it("does nothing for manual progress tasks", () => {
    const taskRepo = new MockTaskRepository();
    taskRepo.tasks.set("1", makeTask({ id: "1", progressTracker: "manual", progress: 0.25 }));
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeIfComputed("1");

    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it("sets no-child computed progress to 0 when incomplete", () => {
    const taskRepo = new MockTaskRepository();
    taskRepo.tasks.set("1", makeTask({ id: "1", progressTracker: "computed_from_subtasks", status: "todo", progress: 1 }));
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeIfComputed("1");

    expect(taskRepo.update).toHaveBeenCalledWith("1", expect.objectContaining({ progress: 0 }));
  });

  it("sets no-child computed progress to 1 when completed", () => {
    const taskRepo = new MockTaskRepository();
    taskRepo.tasks.set("1", makeTask({ id: "1", progressTracker: "computed_from_subtasks", status: "completed", progress: 0 }));
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeIfComputed("1");

    expect(taskRepo.update).toHaveBeenCalledWith("1", expect.objectContaining({ progress: 1 }));
  });

  it("averages direct child progress and treats completed children as 1", () => {
    const taskRepo = new MockTaskRepository();
    taskRepo.tasks.set("parent", makeTask({ id: "parent", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("a", makeTask({ id: "a", progress: 0.25 }));
    taskRepo.tasks.set("b", makeTask({ id: "b", status: "completed", progress: 0.1 }));
    taskRepo.addRelationship("parent", "a");
    taskRepo.addRelationship("parent", "b");
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeIfComputed("parent");

    expect(taskRepo.update).toHaveBeenCalledWith("parent", expect.objectContaining({ progress: 0.625 }));
  });

  it("recursively recomputes computed ancestors", () => {
    const taskRepo = new MockTaskRepository();
    taskRepo.tasks.set("grand", makeTask({ id: "grand", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("parent", makeTask({ id: "parent", progressTracker: "computed_from_subtasks" }));
    taskRepo.tasks.set("child", makeTask({ id: "child", progress: 0.5 }));
    taskRepo.addRelationship("grand", "parent");
    taskRepo.addRelationship("parent", "child");
    const service = new ProgressService(taskRepo.asRepository());

    service.recomputeAncestors("child");

    expect(taskRepo.update).toHaveBeenCalledWith("parent", expect.objectContaining({ progress: 0.5 }));
    expect(taskRepo.update).toHaveBeenCalledWith("grand", expect.objectContaining({ progress: 0.5 }));
  });
});

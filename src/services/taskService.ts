import { conflict, notFound, validationError } from "../domain/errors.js";
import { nowUtc } from "../domain/datetime.js";
import type { CreateTaskInput, Task, TaskListQuery, UpdateTaskInput } from "../domain/task.js";
import type { Database } from "../repositories/database.js";
import type { IdRepository } from "../repositories/idRepository.js";
import type { TaskRepository } from "../repositories/taskRepository.js";
import { ProgressService } from "./progressService.js";

export class TaskService {
  private readonly progress: ProgressService;

  constructor(
    private readonly database: Database,
    private readonly ids: IdRepository,
    private readonly tasks: TaskRepository
  ) {
    this.progress = new ProgressService(tasks);
  }

  create(input: CreateTaskInput): Task {
    return this.database.transaction(() => {
      this.ensureExistingTasks([...input.parentTaskIds, ...input.childTaskIds, ...input.blockedByTaskIds]);
      const { id } = this.ids.next("task");
      this.ensureNoSelfReferences(id, input.parentTaskIds, input.childTaskIds, input.blockedByTaskIds);
      const timestamp = nowUtc();
      const completedAt = input.status === "completed" ? timestamp : undefined;
      this.tasks.create({
        id,
        title: input.title,
        description: input.description,
        status: input.status,
        createdAt: timestamp,
        completedAt,
        deadline: input.deadline,
        progressTracker: input.progressTracker,
        progress: input.status === "completed" && input.progressTracker === "manual" ? input.progress || 1 : input.progress,
        updatedAt: timestamp
      });
      for (const parentId of input.parentTaskIds) this.addRelationship(parentId, id, false);
      for (const childId of input.childTaskIds) this.addRelationship(id, childId, false);
      if (input.blockedByTaskIds.length) this.tasks.setBlockers(id, input.blockedByTaskIds);
      this.progress.recomputeIfComputed(id);
      this.progress.recomputeAncestors(id);
      const task = this.tasks.findById(id);
      if (!task) throw new Error("Created task was not found");
      return task;
    });
  }

  list(query: TaskListQuery): { items: Task[]; nextCursor?: string } {
    return this.tasks.list(query);
  }

  get(id: string): Task {
    const task = this.tasks.findById(id);
    if (!task) throw notFound(`Task ${id} was not found`);
    return task;
  }

  update(id: string, input: UpdateTaskInput): Task {
    return this.database.transaction(() => {
      const current = this.get(id);
      const nextTracker = input.progressTracker ?? current.progressTracker;
      if (nextTracker === "computed_from_subtasks" && input.progress !== undefined) {
        throw validationError("progress cannot be set when progressTracker is computed_from_subtasks");
      }
      if (input.blockedByTaskIds) {
        this.ensureExistingTasks(input.blockedByTaskIds);
        if (input.blockedByTaskIds.includes(id)) throw conflict("A task cannot block itself");
        this.tasks.setBlockers(id, input.blockedByTaskIds);
      }

      const patch: UpdateTaskInput & { updatedAt: string } = { ...input, updatedAt: nowUtc() };
      if (input.status === "completed" && input.completedAt === undefined && current.status !== "completed") {
        patch.completedAt = nowUtc();
      }
      if (input.status && input.status !== "completed" && input.completedAt === undefined) {
        patch.completedAt = null;
      }
      if (input.progressTracker === "computed_from_subtasks") patch.progress = undefined;
      if (input.status === "completed" && nextTracker === "manual" && input.progress === undefined) patch.progress = 1;
      delete patch.blockedByTaskIds;
      this.tasks.update(id, patch);
      this.progress.recomputeIfComputed(id);
      this.progress.recomputeAncestors(id);
      return this.get(id);
    });
  }

  delete(id: string): void {
    this.database.transaction(() => {
      this.get(id);
      const parents = this.tasks.parentIds(id);
      this.tasks.delete(id);
      for (const parentId of parents) this.progress.recomputeTaskAndAncestors(parentId);
    });
  }

  addParent(id: string, parentTaskId: string): Task {
    return this.database.transaction(() => {
      this.addRelationship(parentTaskId, id, true);
      return this.get(id);
    });
  }

  removeParent(id: string, parentTaskId: string): Task {
    return this.database.transaction(() => {
      this.ensureExistingTasks([id, parentTaskId]);
      this.tasks.removeRelationship(parentTaskId, id);
      this.progress.recomputeTaskAndAncestors(parentTaskId);
      return this.get(id);
    });
  }

  addChild(id: string, childTaskId: string): Task {
    return this.database.transaction(() => {
      this.addRelationship(id, childTaskId, true);
      return this.get(id);
    });
  }

  removeChild(id: string, childTaskId: string): Task {
    return this.database.transaction(() => {
      this.ensureExistingTasks([id, childTaskId]);
      this.tasks.removeRelationship(id, childTaskId);
      this.progress.recomputeTaskAndAncestors(id);
      return this.get(id);
    });
  }

  addBlocker(id: string, blockingTaskId: string): Task {
    return this.database.transaction(() => {
      this.ensureExistingTasks([id, blockingTaskId]);
      if (id === blockingTaskId) throw conflict("A task cannot block itself");
      this.tasks.addBlocker(id, blockingTaskId);
      return this.get(id);
    });
  }

  removeBlocker(id: string, blockingTaskId: string): Task {
    return this.database.transaction(() => {
      this.ensureExistingTasks([id, blockingTaskId]);
      this.tasks.removeBlocker(id, blockingTaskId);
      return this.get(id);
    });
  }

  private addRelationship(parentTaskId: string, childTaskId: string, recompute: boolean): void {
    this.ensureExistingTasks([parentTaskId, childTaskId]);
    if (parentTaskId === childTaskId) throw conflict("A task cannot be its own parent or child");
    if (this.wouldCreateCycle(parentTaskId, childTaskId)) throw conflict("Parent/child relationship would create a cycle");
    this.tasks.addRelationship(parentTaskId, childTaskId);
    if (recompute) this.progress.recomputeTaskAndAncestors(parentTaskId);
  }

  private wouldCreateCycle(parentTaskId: string, childTaskId: string): boolean {
    const pending = [childTaskId];
    const seen = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === parentTaskId) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      pending.push(...this.tasks.childIds(current));
    }
    return false;
  }

  private ensureExistingTasks(ids: string[]): void {
    for (const id of new Set(ids)) {
      if (!this.tasks.exists(id)) throw notFound(`Task ${id} was not found`);
    }
  }

  private ensureNoSelfReferences(id: string, parents: string[], children: string[], blockers: string[]): void {
    if (parents.includes(id) || children.includes(id)) throw conflict("A task cannot be its own parent or child");
    if (blockers.includes(id)) throw conflict("A task cannot block itself");
  }
}

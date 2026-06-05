import type { TaskRepository } from "../repositories/taskRepository.js";
import { nowUtc } from "../domain/datetime.js";

export class ProgressService {
  constructor(private readonly tasks: TaskRepository) {}

  recomputeTaskAndAncestors(taskId: string): void {
    this.recomputeIfComputed(taskId);
    for (const parentId of this.tasks.parentIds(taskId)) {
      this.recomputeTaskAndAncestors(parentId);
    }
  }

  recomputeAncestors(taskId: string): void {
    for (const parentId of this.tasks.parentIds(taskId)) {
      this.recomputeTaskAndAncestors(parentId);
    }
  }

  recomputeIfComputed(taskId: string): void {
    const task = this.tasks.findById(taskId);
    if (!task || task.progressTracker !== "computed_from_subtasks") return;
    const childIds = this.tasks.childIds(taskId);
    const progress =
      childIds.length === 0
        ? task.status === "completed"
          ? 1
          : 0
        : childIds.reduce((sum, childId) => {
            const child = this.tasks.findById(childId);
            if (!child) return sum;
            return sum + (child.status === "completed" ? 1 : child.progress);
          }, 0) / childIds.length;
    this.tasks.update(taskId, { progress, updatedAt: nowUtc() });
  }
}

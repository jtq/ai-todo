import { conflict, notFound, validationError } from "../domain/errors.js";
import { nowUtc } from "../domain/datetime.js";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "../domain/comment.js";
import type { Database } from "../repositories/database.js";
import type { IdRepository } from "../repositories/idRepository.js";
import type { CommentRepository } from "../repositories/commentRepository.js";
import type { TaskRepository } from "../repositories/taskRepository.js";

export class CommentService {
  constructor(
    private readonly database: Database,
    private readonly ids: IdRepository,
    private readonly comments: CommentRepository,
    private readonly tasks: TaskRepository
  ) {}

  create(taskId: string, input: CreateCommentInput): Comment {
    return this.database.transaction(() => {
      if (!this.tasks.exists(taskId)) throw notFound(`Task ${taskId} was not found`);
      const { id } = this.ids.next("comment");
      const timestamp = nowUtc();
      const comment: Comment = {
        id,
        taskId,
        body: input.body,
        position: this.comments.nextPosition(taskId),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      this.comments.create(comment);
      return comment;
    });
  }

  get(id: string): Comment {
    const comment = this.comments.findById(id);
    if (!comment) throw notFound(`Comment ${id} was not found`);
    return comment;
  }

  update(id: string, input: UpdateCommentInput): Comment {
    return this.database.transaction(() => {
      this.get(id);
      this.comments.update(id, { ...input, updatedAt: nowUtc() });
      return this.get(id);
    });
  }

  delete(id: string): void {
    this.database.transaction(() => {
      const comment = this.get(id);
      this.comments.delete(id);
      this.comments.normalizePositions(comment.taskId);
    });
  }

  reorder(taskId: string, commentIds: string[]): Comment[] {
    return this.database.transaction(() => {
      if (!this.tasks.exists(taskId)) throw notFound(`Task ${taskId} was not found`);
      if (new Set(commentIds).size !== commentIds.length) {
        throw validationError("commentIds must not contain duplicates");
      }
      const currentIds = this.comments.listForTask(taskId).map((comment) => comment.id);
      if (currentIds.length !== commentIds.length || currentIds.some((id) => !commentIds.includes(id))) {
        throw conflict("Reorder must include exactly the comment IDs owned by the task");
      }
      this.comments.reorder(taskId, commentIds);
      return this.comments.listForTask(taskId);
    });
  }
}

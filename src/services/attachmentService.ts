import { conflict, notFound, validationError } from "../domain/errors.js";
import { nowUtc } from "../domain/datetime.js";
import type { Attachment, CreateAttachmentInput, UpdateAttachmentInput } from "../domain/attachment.js";
import type { Database } from "../repositories/database.js";
import type { IdRepository } from "../repositories/idRepository.js";
import type { AttachmentRepository } from "../repositories/attachmentRepository.js";
import type { TaskRepository } from "../repositories/taskRepository.js";

export class AttachmentService {
  constructor(
    private readonly database: Database,
    private readonly ids: IdRepository,
    private readonly attachments: AttachmentRepository,
    private readonly tasks: TaskRepository
  ) {}

  create(taskId: string, input: CreateAttachmentInput): Attachment {
    return this.database.transaction(() => {
      if (!this.tasks.exists(taskId)) throw notFound(`Task ${taskId} was not found`);
      const { id } = this.ids.next("attachment");
      const timestamp = nowUtc();
      const attachment: Attachment = {
        id,
        taskId,
        description: input.description,
        url: input.url,
        type: input.type,
        position: this.attachments.nextPosition(taskId),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      this.attachments.create(attachment);
      return attachment;
    });
  }

  get(id: string): Attachment {
    const attachment = this.attachments.findById(id);
    if (!attachment) throw notFound(`Attachment ${id} was not found`);
    return attachment;
  }

  update(id: string, input: UpdateAttachmentInput): Attachment {
    return this.database.transaction(() => {
      this.get(id);
      this.attachments.update(id, { ...input, updatedAt: nowUtc() });
      return this.get(id);
    });
  }

  delete(id: string): void {
    this.database.transaction(() => {
      const attachment = this.get(id);
      this.attachments.delete(id);
      this.attachments.normalizePositions(attachment.taskId);
    });
  }

  reorder(taskId: string, attachmentIds: string[]): Attachment[] {
    return this.database.transaction(() => {
      if (!this.tasks.exists(taskId)) throw notFound(`Task ${taskId} was not found`);
      if (new Set(attachmentIds).size !== attachmentIds.length) {
        throw validationError("attachmentIds must not contain duplicates");
      }
      const currentIds = this.attachments.listForTask(taskId).map((attachment) => attachment.id);
      if (currentIds.length !== attachmentIds.length || currentIds.some((id) => !attachmentIds.includes(id))) {
        throw conflict("Reorder must include exactly the attachment IDs owned by the task");
      }
      this.attachments.reorder(taskId, attachmentIds);
      return this.attachments.listForTask(taskId);
    });
  }
}

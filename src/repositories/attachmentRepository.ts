import type { Attachment } from "../domain/attachment.js";
import type { Database } from "./database.js";

type SqlInput = string | number | null;

interface AttachmentRow {
  id: string;
  task_id: string;
  description: string;
  url: string;
  type: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export class AttachmentRepository {
  constructor(private readonly database: Database) {}

  create(attachment: Attachment): void {
    this.database.db
      .prepare(
        `insert into attachments(id, task_id, description, url, type, position, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        attachment.id,
        attachment.taskId,
        attachment.description,
        attachment.url,
        attachment.type ?? null,
        attachment.position,
        attachment.createdAt,
        attachment.updatedAt
      );
  }

  update(id: string, patch: Partial<Pick<Attachment, "description" | "url" | "updatedAt">> & { type?: string | null }): void {
    const assignments: string[] = [];
    const values: SqlInput[] = [];
    const add = (column: string, value: SqlInput | undefined): void => {
      assignments.push(`${column} = ?`);
      values.push(value ?? null);
    };
    if ("description" in patch) add("description", patch.description);
    if ("url" in patch) add("url", patch.url);
    if ("type" in patch) add("type", patch.type ?? null);
    if ("updatedAt" in patch) add("updated_at", patch.updatedAt);
    if (assignments.length === 0) return;
    values.push(id);
    this.database.db.prepare(`update attachments set ${assignments.join(", ")} where id = ?`).run(...values);
  }

  delete(id: string): void {
    this.database.db.prepare("delete from entities where id = ? and entity_type = 'attachment'").run(id);
  }

  findById(id: string): Attachment | undefined {
    const row = this.database.db.prepare("select * from attachments where id = ?").get(id) as AttachmentRow | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  listForTask(taskId: string): Attachment[] {
    return (this.database.db
      .prepare("select * from attachments where task_id = ? order by position")
      .all(taskId) as unknown as AttachmentRow[]).map((row) => this.hydrate(row));
  }

  nextPosition(taskId: string): number {
    const row = this.database.db.prepare("select coalesce(max(position), -1) + 1 as position from attachments where task_id = ?").get(taskId) as {
      position: number;
    };
    return row.position;
  }

  reorder(taskId: string, attachmentIds: string[]): void {
    const temporary = this.database.db.prepare("update attachments set position = ? where task_id = ? and id = ?");
    attachmentIds.forEach((attachmentId, index) => temporary.run(-(index + 1), taskId, attachmentId));
    const final = this.database.db.prepare("update attachments set position = ? where task_id = ? and id = ?");
    attachmentIds.forEach((attachmentId, position) => final.run(position, taskId, attachmentId));
  }

  normalizePositions(taskId: string): void {
    const ids = this.listForTask(taskId).map((attachment) => attachment.id);
    this.reorder(taskId, ids);
  }

  private hydrate(row: AttachmentRow): Attachment {
    return {
      id: row.id,
      taskId: row.task_id,
      description: row.description,
      url: row.url,
      type: row.type ?? undefined,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

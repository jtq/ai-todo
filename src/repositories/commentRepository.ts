import type { Comment } from "../domain/comment.js";
import type { Database } from "./database.js";

interface CommentRow {
  id: string;
  task_id: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export class CommentRepository {
  constructor(private readonly database: Database) {}

  create(comment: Comment): void {
    this.database.db
      .prepare(
        `insert into comments(id, task_id, body, position, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?)`
      )
      .run(comment.id, comment.taskId, comment.body, comment.position, comment.createdAt, comment.updatedAt);
  }

  update(id: string, patch: Partial<Pick<Comment, "body" | "updatedAt">>): void {
    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    const add = (column: string, value: string | number | null | undefined): void => {
      assignments.push(`${column} = ?`);
      values.push(value ?? null);
    };
    if ("body" in patch) add("body", patch.body);
    if ("updatedAt" in patch) add("updated_at", patch.updatedAt);
    if (assignments.length === 0) return;
    values.push(id);
    this.database.db.prepare(`update comments set ${assignments.join(", ")} where id = ?`).run(...values);
  }

  delete(id: string): void {
    this.database.db.prepare("delete from entities where id = ? and entity_type = 'comment'").run(id);
  }

  findById(id: string): Comment | undefined {
    const row = this.database.db.prepare("select * from comments where id = ?").get(id) as CommentRow | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  listForTask(taskId: string): Comment[] {
    return (this.database.db
      .prepare("select * from comments where task_id = ? order by position")
      .all(taskId) as unknown as CommentRow[]).map((row) => this.hydrate(row));
  }

  nextPosition(taskId: string): number {
    const row = this.database.db
      .prepare("select coalesce(max(position), -1) + 1 as position from comments where task_id = ?")
      .get(taskId) as { position: number };
    return row.position;
  }

  reorder(taskId: string, commentIds: string[]): void {
    const temporary = this.database.db.prepare("update comments set position = ? where task_id = ? and id = ?");
    commentIds.forEach((commentId, index) => temporary.run(-(index + 1), taskId, commentId));
    const final = this.database.db.prepare("update comments set position = ? where task_id = ? and id = ?");
    commentIds.forEach((commentId, position) => final.run(position, taskId, commentId));
  }

  normalizePositions(taskId: string): void {
    const ids = this.listForTask(taskId).map((comment) => comment.id);
    this.reorder(taskId, ids);
  }

  private hydrate(row: CommentRow): Comment {
    return {
      id: row.id,
      taskId: row.task_id,
      body: row.body,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

import type { Database } from "./database.js";
import type { Deadline, ProgressTracker, Task, TaskListQuery, TaskStatus } from "../domain/task.js";

type SqlInput = string | number | null;

interface TaskUpdatePatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  completedAt?: string | null;
  deadline?: Deadline | null;
  progressTracker?: ProgressTracker;
  progress?: number;
  updatedAt?: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
  deadline_kind: "date" | "datetime" | null;
  deadline_date: string | null;
  deadline_datetime: string | null;
  progress_tracker: ProgressTracker;
  progress: number;
  created_by: string | null;
  updated_at: string;
}

export class TaskRepository {
  constructor(private readonly database: Database) {}

  create(task: Omit<Task, "attachments" | "comments" | "parentTaskId" | "childTaskIds" | "blockedByTaskIds">): void {
    const deadline = this.toDeadlineColumns(task.deadline);
    this.database.db
      .prepare(
        `insert into tasks(
          id, title, description, status, created_at, completed_at,
          deadline_kind, deadline_date, deadline_datetime,
          progress_tracker, progress, created_by, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.title,
        task.description ?? null,
        task.status,
        task.createdAt,
        task.completedAt ?? null,
        deadline.kind,
        deadline.date,
        deadline.datetime,
        task.progressTracker,
        task.progress,
        task.createdBy ?? null,
        task.updatedAt
      );
  }

  update(id: string, patch: TaskUpdatePatch): void {
    const assignments: string[] = [];
    const values: SqlInput[] = [];
    const add = (column: string, value: SqlInput | undefined): void => {
      assignments.push(`${column} = ?`);
      values.push(value ?? null);
    };
    if ("title" in patch) add("title", patch.title);
    if ("description" in patch) add("description", patch.description ?? null);
    if ("status" in patch) add("status", patch.status);
    if ("completedAt" in patch) add("completed_at", patch.completedAt ?? null);
    if ("deadline" in patch) {
      const deadline = this.toDeadlineColumns(patch.deadline ?? undefined);
      add("deadline_kind", deadline.kind);
      add("deadline_date", deadline.date);
      add("deadline_datetime", deadline.datetime);
    }
    if ("progressTracker" in patch) add("progress_tracker", patch.progressTracker);
    if ("progress" in patch) add("progress", patch.progress);
    if ("updatedAt" in patch) add("updated_at", patch.updatedAt);
    if (assignments.length === 0) return;
    values.push(id);
    this.database.db.prepare(`update tasks set ${assignments.join(", ")} where id = ?`).run(...values);
  }

  delete(id: string): void {
    this.database.db.prepare("delete from entities where id = ? and entity_type = 'task'").run(id);
  }

  findById(id: string): Task | undefined {
    const row = this.database.db.prepare("select * from tasks where id = ?").get(id) as TaskRow | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  exists(id: string): boolean {
    const row = this.database.db.prepare("select 1 as ok from tasks where id = ?").get(id) as { ok: 1 } | undefined;
    return Boolean(row);
  }

  list(query: TaskListQuery): { items: Task[]; nextCursor?: string } {
    const where: string[] = [];
    const values: SqlInput[] = [];
    const add = (sql: string, value?: SqlInput): void => {
      where.push(sql);
      if (value !== undefined) values.push(value);
    };
    if (query.status) add("t.status = ?", query.status);
    if (query.parentTaskId) add("exists (select 1 from task_relationships r where r.parent_task_id = ? and r.child_task_id = t.id)", query.parentTaskId);
    if (query.childTaskId) add("exists (select 1 from task_relationships r where r.child_task_id = ? and r.parent_task_id = t.id)", query.childTaskId);
    if (query.blockedByTaskId) add("exists (select 1 from task_blocks b where b.blocking_task_id = ? and b.blocked_task_id = t.id)", query.blockedByTaskId);
    if (query.hasDeadline !== undefined) add(query.hasDeadline ? "t.deadline_kind is not null" : "t.deadline_kind is null");
    if (query.deadlineBefore) {
      add("(coalesce(t.deadline_datetime, t.deadline_date) is not null and coalesce(t.deadline_datetime, t.deadline_date) < ?)", query.deadlineBefore);
    }
    if (query.deadlineAfter) {
      add("(coalesce(t.deadline_datetime, t.deadline_date) is not null and coalesce(t.deadline_datetime, t.deadline_date) > ?)", query.deadlineAfter);
    }
    if (query.createdBefore) add("t.created_at < ?", query.createdBefore);
    if (query.createdAfter) add("t.created_at > ?", query.createdAfter);
    if (query.search) {
      values.push(`%${query.search}%`, `%${query.search}%`);
      where.push("(t.title like ? or t.description like ?)");
    }
    if (query.cursor) add("t.id > ?", query.cursor);

    const orderBy = {
      created_at_asc: "t.created_at asc, t.id asc",
      created_at_desc: "t.created_at desc, t.id asc",
      deadline_asc: "coalesce(t.deadline_datetime, t.deadline_date) asc, t.id asc",
      deadline_desc: "coalesce(t.deadline_datetime, t.deadline_date) desc, t.id asc",
      title_asc: "t.title asc, t.id asc",
      status_asc: "t.status asc, t.id asc"
    }[query.sort];

    const limit = query.limit + 1;
    const sql = `select t.* from tasks t ${where.length ? `where ${where.join(" and ")}` : ""} order by ${orderBy} limit ?`;
    const rows = this.database.db.prepare(sql).all(...values, limit) as unknown as TaskRow[];
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((row) => this.hydrate(row));
    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  addRelationship(parentTaskId: string, childTaskId: string): void {
    this.database.db.prepare("delete from task_relationships where child_task_id = ?").run(childTaskId);
    this.database.db
      .prepare("insert or ignore into task_relationships(parent_task_id, child_task_id) values (?, ?)")
      .run(parentTaskId, childTaskId);
  }

  removeRelationship(parentTaskId: string, childTaskId: string): void {
    this.database.db
      .prepare("delete from task_relationships where parent_task_id = ? and child_task_id = ?")
      .run(parentTaskId, childTaskId);
  }

  setBlockers(blockedTaskId: string, blockingTaskIds: string[]): void {
    this.database.db.prepare("delete from task_blocks where blocked_task_id = ?").run(blockedTaskId);
    const stmt = this.database.db.prepare("insert into task_blocks(blocked_task_id, blocking_task_id) values (?, ?)");
    for (const blockingTaskId of blockingTaskIds) stmt.run(blockedTaskId, blockingTaskId);
  }

  addBlocker(blockedTaskId: string, blockingTaskId: string): void {
    this.database.db
      .prepare("insert or ignore into task_blocks(blocked_task_id, blocking_task_id) values (?, ?)")
      .run(blockedTaskId, blockingTaskId);
  }

  removeBlocker(blockedTaskId: string, blockingTaskId: string): void {
    this.database.db
      .prepare("delete from task_blocks where blocked_task_id = ? and blocking_task_id = ?")
      .run(blockedTaskId, blockingTaskId);
  }

  parentIds(childTaskId: string): string[] {
    return this.database.db
      .prepare("select parent_task_id as id from task_relationships where child_task_id = ? order by parent_task_id")
      .all(childTaskId)
      .map((row) => (row as { id: string }).id);
  }

  childIds(parentTaskId: string): string[] {
    return this.database.db
      .prepare("select child_task_id as id from task_relationships where parent_task_id = ? order by child_task_id")
      .all(parentTaskId)
      .map((row) => (row as { id: string }).id);
  }

  blockedByIds(blockedTaskId: string): string[] {
    return this.database.db
      .prepare("select blocking_task_id as id from task_blocks where blocked_task_id = ? order by blocking_task_id")
      .all(blockedTaskId)
      .map((row) => (row as { id: string }).id);
  }

  attachmentIds(taskId: string): string[] {
    return this.database.db
      .prepare("select id from attachments where task_id = ? order by position")
      .all(taskId)
      .map((row) => (row as { id: string }).id);
  }

  parentId(childTaskId: string): string | undefined {
    const row = this.database.db
      .prepare("select parent_task_id as id from task_relationships where child_task_id = ?")
      .get(childTaskId) as { id: string } | undefined;
    return row?.id;
  }

  commentIds(taskId: string): string[] {
    return this.database.db
      .prepare("select id from comments where task_id = ? order by position")
      .all(taskId)
      .map((row) => (row as { id: string }).id);
  }

  private hydrate(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      deadline: this.fromDeadlineColumns(row),
      attachments: this.attachmentIds(row.id),
      comments: this.commentIds(row.id),
      progressTracker: row.progress_tracker,
      progress: row.progress,
      parentTaskId: this.parentId(row.id),
      childTaskIds: this.childIds(row.id),
      blockedByTaskIds: this.blockedByIds(row.id),
      createdBy: row.created_by ?? undefined,
      updatedAt: row.updated_at
    };
  }

  private toDeadlineColumns(deadline?: Deadline): { kind: string | null; date: string | null; datetime: string | null } {
    if (!deadline) return { kind: null, date: null, datetime: null };
    return deadline.kind === "date"
      ? { kind: "date", date: deadline.date, datetime: null }
      : { kind: "datetime", date: null, datetime: deadline.datetime };
  }

  private fromDeadlineColumns(row: TaskRow): Deadline | undefined {
    if (row.deadline_kind === "date" && row.deadline_date) return { kind: "date", date: row.deadline_date };
    if (row.deadline_kind === "datetime" && row.deadline_datetime) {
      return { kind: "datetime", datetime: row.deadline_datetime };
    }
    return undefined;
  }
}

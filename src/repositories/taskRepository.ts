import type { Database } from "./database.js";
import { encodeTaskCursor, type TaskCursor } from "../domain/cursor.js";
import type { Deadline, ProgressTracker, Task, TaskListQuery, TaskSort, TaskStatus, TaskUrgency } from "../domain/task.js";

type SqlInput = string | number | null;

const URGENCY_RANK = `
  case t.urgency
    when 'critical' then 5
    when 'urgent' then 4
    when 'medium' then 3
    when 'low' then 2
    when 'whenever' then 1
  end
`;

/**
 * Per-sort keyset pagination metadata. `keyExpr` is the SQL expression that both the ORDER BY
 * and the cursor comparison are built from, so a page's ordering and its pagination filter can
 * never drift apart the way the old `t.id > ?` cursor did for every sort but one.
 */
const SORT_SPECS: Record<TaskSort, { keyExpr: string; direction: "asc" | "desc"; nullable: boolean }> = {
  created_at_asc: { keyExpr: "t.created_at", direction: "asc", nullable: false },
  created_at_desc: { keyExpr: "t.created_at", direction: "desc", nullable: false },
  deadline_asc: { keyExpr: "coalesce(t.deadline_datetime, t.deadline_date)", direction: "asc", nullable: true },
  deadline_desc: { keyExpr: "coalesce(t.deadline_datetime, t.deadline_date)", direction: "desc", nullable: true },
  title_asc: { keyExpr: "t.title", direction: "asc", nullable: false },
  status_asc: { keyExpr: "t.status", direction: "asc", nullable: false },
  urgency_asc: { keyExpr: URGENCY_RANK, direction: "asc", nullable: false },
  urgency_desc: { keyExpr: URGENCY_RANK, direction: "desc", nullable: false }
};

/**
 * Builds the `(sort key, tiebreaker)` tuple comparison for "rows strictly after this cursor's
 * position in this sort," matching the NULLS FIRST/LAST convention applied to the ORDER BY below.
 * `entities.sequence_value` (a real monotonic integer) is used as the tiebreaker rather than the
 * task id, since unpadded base62 ids don't compare correctly once their length changes (e.g. the
 * string "9" sorts after "10" even though 9 < 62).
 */
function keysetPredicate(spec: (typeof SORT_SPECS)[TaskSort], cursor: TaskCursor): { sql: string; values: SqlInput[] } {
  const { keyExpr, direction, nullable } = spec;
  const cmp = direction === "asc" ? ">" : "<";

  if (!nullable) {
    return {
      sql: `(${keyExpr} ${cmp} ? or (${keyExpr} = ? and e.sequence_value > ?))`,
      values: [cursor.key, cursor.key, cursor.seq]
    };
  }

  const nullsFirst = direction === "asc";
  if (cursor.key === null) {
    return nullsFirst
      ? { sql: `((${keyExpr} is null and e.sequence_value > ?) or ${keyExpr} is not null)`, values: [cursor.seq] }
      : { sql: `(${keyExpr} is null and e.sequence_value > ?)`, values: [cursor.seq] };
  }
  return nullsFirst
    ? {
        sql: `(${keyExpr} is not null and (${keyExpr} ${cmp} ? or (${keyExpr} = ? and e.sequence_value > ?)))`,
        values: [cursor.key, cursor.key, cursor.seq]
      }
    : {
        sql: `((${keyExpr} is not null and (${keyExpr} ${cmp} ? or (${keyExpr} = ? and e.sequence_value > ?))) or ${keyExpr} is null)`,
        values: [cursor.key, cursor.key, cursor.seq]
      };
}

interface TaskUpdatePatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  urgency?: TaskUrgency;
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
  urgency: TaskUrgency;
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
          id, title, description, status, urgency, created_at, completed_at,
          deadline_kind, deadline_date, deadline_datetime,
          progress_tracker, progress, created_by, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.title,
        task.description ?? null,
        task.status,
        task.urgency,
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
    if ("urgency" in patch) add("urgency", patch.urgency);
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

  /**
   * `cursor`, if present, must already be decoded and validated against `query.sort` by the
   * caller (see TaskService.list) — this method trusts it encodes a position in exactly the
   * ordering `query.sort` produces.
   */
  list(query: TaskListQuery, cursor?: TaskCursor): { items: Task[]; nextCursor?: string } {
    const where: string[] = [];
    const values: SqlInput[] = [];
    const add = (sql: string, ...vals: SqlInput[]): void => {
      where.push(sql);
      values.push(...vals);
    };
    if (query.status) add("t.status = ?", query.status);
    if (query.urgency) add("t.urgency = ?", query.urgency);
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

    const spec = SORT_SPECS[query.sort];
    if (cursor) {
      const predicate = keysetPredicate(spec, cursor);
      add(predicate.sql, ...predicate.values);
    }

    const nulls = spec.nullable ? (spec.direction === "asc" ? " nulls first" : " nulls last") : "";
    const orderBy = `${spec.keyExpr} ${spec.direction}${nulls}, e.sequence_value asc`;

    const limit = query.limit + 1;
    const sql = `
      select t.*, e.sequence_value as seq, (${spec.keyExpr}) as sort_key
      from tasks t
      join entities e on e.id = t.id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by ${orderBy}
      limit ?
    `;
    const rows = this.database.db.prepare(sql).all(...values, limit) as unknown as (TaskRow & {
      seq: number;
      sort_key: string | number | null;
    })[];
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const items = page.map((row) => this.hydrate(row));
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeTaskCursor({ sort: query.sort, key: last.sort_key, seq: last.seq }) : undefined;
    return { items, nextCursor };
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
      urgency: row.urgency,
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

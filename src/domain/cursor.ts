import type { TaskSort } from "./task.js";

const TASK_SORTS: readonly TaskSort[] = [
  "created_at_asc",
  "created_at_desc",
  "deadline_asc",
  "deadline_desc",
  "title_asc",
  "status_asc",
  "urgency_asc",
  "urgency_desc"
];

/**
 * A keyset pagination position for the tasks list endpoint.
 *
 * `sort` pins the cursor to the ordering it was produced under, `key` is the value of that
 * ordering's sort column for the last row returned, and `seq` is that row's entities.sequence_value
 * (a real monotonic integer, unlike the unpadded base62 task id) used as the tiebreaker.
 */
export interface TaskCursor {
  sort: TaskSort;
  key: string | number | null;
  seq: number;
}

export function encodeTaskCursor(cursor: TaskCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Returns undefined if `raw` is not a well-formed cursor produced by {@link encodeTaskCursor}. */
export function decodeTaskCursor(raw: string): TaskCursor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { sort, key, seq } = parsed as Record<string, unknown>;
  if (typeof sort !== "string" || !TASK_SORTS.includes(sort as TaskSort)) return undefined;
  if (typeof seq !== "number" || !Number.isFinite(seq)) return undefined;
  if (key !== null && typeof key !== "string" && typeof key !== "number") return undefined;
  return { sort: sort as TaskSort, key, seq };
}

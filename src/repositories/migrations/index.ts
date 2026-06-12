import { migration001InitialSchema } from "./001_initial_schema.js";
import { migration002AddOnHoldAndWontDoStatuses } from "./002_add_on_hold_and_wont_do_statuses.js";
import { migration003AddTaskComments } from "./003_add_task_comments.js";
import { migration004EnforceSingleParentTask } from "./004_enforce_single_parent_task.js";

export interface Migration {
  id: string;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [
  migration001InitialSchema,
  migration002AddOnHoldAndWontDoStatuses,
  migration003AddTaskComments,
  migration004EnforceSingleParentTask
];

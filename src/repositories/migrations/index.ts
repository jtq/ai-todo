import { migration001InitialSchema } from "./001_initial_schema.js";
import { migration002AddOnHoldAndWontDoStatuses } from "./002_add_on_hold_and_wont_do_statuses.js";

export interface Migration {
  id: string;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [migration001InitialSchema, migration002AddOnHoldAndWontDoStatuses];

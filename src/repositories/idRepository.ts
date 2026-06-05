import { encodeBase62 } from "../domain/id.js";
import { nowUtc } from "../domain/datetime.js";
import type { Database } from "./database.js";

export class IdRepository {
  database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  next(entityType: "task" | "attachment"): { id: string; sequenceValue: number } {
    const row = this.database.db.prepare("select value from id_sequence where name = 'global'").get() as
      | { value: number }
      | undefined;
    if (!row) throw new Error("ID sequence is not initialized");
    const sequenceValue = Number(row.value) + 1;
    this.database.db.prepare("update id_sequence set value = ? where name = 'global'").run(sequenceValue);
    const id = encodeBase62(sequenceValue);
    this.database.db.prepare(
      "insert into entities(id, entity_type, sequence_value, created_at) values (?, ?, ?, ?)"
    ).run(id, entityType, sequenceValue, nowUtc());
    return { id, sequenceValue };
  }
}

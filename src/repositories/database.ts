import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { AppConfig } from "../config/env.js";
import { migrations } from "./migrations/index.js";

export class Database {
  path: string;
  db: DatabaseSync;

  constructor(config: Pick<AppConfig, "dataDir" | "databaseFilename">) {
    this.path = join(config.dataDir, config.databaseFilename);
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      create table if not exists schema_migrations (
        id text primary key,
        description text not null,
        applied_at text not null
      )
    `);

    for (const migration of migrations) {
      const applied = this.db.prepare("select 1 from schema_migrations where id = ?").get(migration.id);
      if (applied) continue;

      this.db.exec("PRAGMA foreign_keys = OFF");
      try {
        this.transaction(() => {
          this.db.exec(migration.sql);
          this.db
            .prepare("insert into schema_migrations(id, description, applied_at) values (?, ?, ?)")
            .run(migration.id, migration.description, new Date().toISOString());
        });
      } finally {
        this.db.exec("PRAGMA foreign_keys = ON");
      }
    }
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

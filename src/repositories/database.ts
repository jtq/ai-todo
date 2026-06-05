import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { AppConfig } from "../config/env.js";

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
      create table if not exists id_sequence (
        name text primary key,
        value integer not null
      );

      create table if not exists entities (
        id text primary key,
        entity_type text not null check (entity_type in ('task', 'attachment')),
        sequence_value integer not null unique,
        created_at text not null
      );

      create table if not exists tasks (
        id text primary key references entities(id) on delete cascade,
        title text not null,
        description text,
        status text not null check (status in ('draft', 'todo', 'in_progress', 'completed')),
        created_at text not null,
        completed_at text,
        deadline_kind text check (deadline_kind in ('date', 'datetime')),
        deadline_date text,
        deadline_datetime text,
        progress_tracker text not null check (progress_tracker in ('computed_from_subtasks', 'manual')),
        progress real not null default 0 check (progress >= 0 and progress <= 1),
        created_by text,
        updated_at text not null,
        check (
          (deadline_kind is null and deadline_date is null and deadline_datetime is null)
          or (deadline_kind = 'date' and deadline_date is not null and deadline_datetime is null)
          or (deadline_kind = 'datetime' and deadline_datetime is not null and deadline_date is null)
        )
      );

      create table if not exists attachments (
        id text primary key references entities(id) on delete cascade,
        task_id text not null references tasks(id) on delete cascade,
        description text not null,
        url text not null,
        type text,
        position integer not null,
        created_at text not null,
        updated_at text not null,
        unique (task_id, position)
      );

      create table if not exists task_relationships (
        parent_task_id text not null references tasks(id) on delete cascade,
        child_task_id text not null references tasks(id) on delete cascade,
        primary key (parent_task_id, child_task_id),
        check (parent_task_id <> child_task_id)
      );

      create table if not exists task_blocks (
        blocked_task_id text not null references tasks(id) on delete cascade,
        blocking_task_id text not null references tasks(id) on delete cascade,
        primary key (blocked_task_id, blocking_task_id),
        check (blocked_task_id <> blocking_task_id)
      );

      create index if not exists idx_tasks_status on tasks(status, id);
      create index if not exists idx_tasks_created_at on tasks(created_at, id);
      create index if not exists idx_tasks_deadline_date on tasks(deadline_date, id);
      create index if not exists idx_tasks_deadline_datetime on tasks(deadline_datetime, id);
      create index if not exists idx_attachments_task_order on attachments(task_id, position);
      create index if not exists idx_task_relationships_child on task_relationships(child_task_id, parent_task_id);
      create index if not exists idx_task_blocks_blocking on task_blocks(blocking_task_id, blocked_task_id);
    `);
    this.db.prepare("insert or ignore into id_sequence(name, value) values ('global', 0)").run();
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

export const migration002AddOnHoldAndWontDoStatuses = {
  id: "002_add_on_hold_and_wont_do_statuses",
  description: "Allow on_hold and wont_do task statuses",
  sql: `
    drop index if exists idx_tasks_status;
    drop index if exists idx_tasks_created_at;
    drop index if exists idx_tasks_deadline_date;
    drop index if exists idx_tasks_deadline_datetime;

    create table tasks_new (
      id text primary key references entities(id) on delete cascade,
      title text not null,
      description text,
      status text not null check (status in ('draft', 'todo', 'in_progress', 'on_hold', 'completed', 'wont_do')),
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

    insert into tasks_new(
      id,
      title,
      description,
      status,
      created_at,
      completed_at,
      deadline_kind,
      deadline_date,
      deadline_datetime,
      progress_tracker,
      progress,
      created_by,
      updated_at
    )
    select
      id,
      title,
      description,
      status,
      created_at,
      completed_at,
      deadline_kind,
      deadline_date,
      deadline_datetime,
      progress_tracker,
      progress,
      created_by,
      updated_at
    from tasks;

    drop table tasks;
    alter table tasks_new rename to tasks;

    create index if not exists idx_tasks_status on tasks(status, id);
    create index if not exists idx_tasks_created_at on tasks(created_at, id);
    create index if not exists idx_tasks_deadline_date on tasks(deadline_date, id);
    create index if not exists idx_tasks_deadline_datetime on tasks(deadline_datetime, id);
  `
};

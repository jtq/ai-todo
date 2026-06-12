export const migration003AddTaskComments = {
  id: "003_add_task_comments",
  description: "Add task-owned comments",
  sql: `
    create table entities_new (
      id text primary key,
      entity_type text not null check (entity_type in ('task', 'attachment', 'comment')),
      sequence_value integer not null unique,
      created_at text not null
    );

    insert into entities_new(id, entity_type, sequence_value, created_at)
    select id, entity_type, sequence_value, created_at from entities;

    drop table entities;
    alter table entities_new rename to entities;

    create table comments (
      id text primary key references entities(id) on delete cascade,
      task_id text not null references tasks(id) on delete cascade,
      body text not null,
      position integer not null,
      created_at text not null,
      updated_at text not null,
      unique (task_id, position)
    );

    create index if not exists idx_comments_task_order on comments(task_id, position);
  `
};

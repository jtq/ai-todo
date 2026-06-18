export const migration005AddTaskUrgency = {
  id: "005_add_task_urgency",
  description: "Add task urgency labels",
  sql: `
    alter table tasks
    add column urgency text not null default 'medium'
    check (urgency in ('critical', 'urgent', 'medium', 'low', 'whenever'));

    create index if not exists idx_tasks_urgency on tasks(urgency, id);
  `
};

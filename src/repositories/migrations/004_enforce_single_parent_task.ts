export const migration004EnforceSingleParentTask = {
  id: "004_enforce_single_parent_task",
  description: "Enforce a single parent task per child task",
  sql: `
    create unique index if not exists idx_task_relationships_single_parent
    on task_relationships(child_task_id);
  `
};

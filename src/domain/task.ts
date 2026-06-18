export type EntityId = string;
export type IsoDateTime = string;
export type IsoDate = string;

export type TaskStatus = "draft" | "todo" | "in_progress" | "on_hold" | "completed" | "wont_do";
export type TaskUrgency = "critical" | "urgent" | "medium" | "low" | "whenever";
export type ProgressTracker = "computed_from_subtasks" | "manual";

export type Deadline = { kind: "date"; date: IsoDate } | { kind: "datetime"; datetime: IsoDateTime };

export interface Task {
  id: EntityId;
  title: string;
  description?: string;
  status: TaskStatus;
  urgency: TaskUrgency;
  createdAt: IsoDateTime;
  completedAt?: IsoDateTime;
  deadline?: Deadline;
  attachments: EntityId[];
  comments: EntityId[];
  progressTracker: ProgressTracker;
  progress: number;
  parentTaskId?: EntityId;
  childTaskIds: EntityId[];
  blockedByTaskIds: EntityId[];
  createdBy?: string;
  updatedAt: IsoDateTime;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  urgency: TaskUrgency;
  deadline?: Deadline;
  progressTracker: ProgressTracker;
  progress: number;
  parentTaskId?: EntityId;
  childTaskIds: EntityId[];
  blockedByTaskIds: EntityId[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  urgency?: TaskUrgency;
  completedAt?: IsoDateTime | null;
  deadline?: Deadline | null;
  progressTracker?: ProgressTracker;
  progress?: number;
  blockedByTaskIds?: EntityId[];
}

export interface TaskListQuery {
  status?: TaskStatus;
  urgency?: TaskUrgency;
  parentTaskId?: EntityId;
  childTaskId?: EntityId;
  blockedByTaskId?: EntityId;
  hasDeadline?: boolean;
  deadlineBefore?: string;
  deadlineAfter?: string;
  createdBefore?: string;
  createdAfter?: string;
  search?: string;
  limit: number;
  cursor?: EntityId;
  sort:
    | "created_at_asc"
    | "created_at_desc"
    | "deadline_asc"
    | "deadline_desc"
    | "title_asc"
    | "status_asc"
    | "urgency_asc"
    | "urgency_desc";
}

import type { EntityId, IsoDateTime } from "./task.js";

export interface Comment {
  id: EntityId;
  taskId: EntityId;
  body: string;
  position: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateCommentInput {
  body: string;
}

export interface UpdateCommentInput {
  body?: string;
}

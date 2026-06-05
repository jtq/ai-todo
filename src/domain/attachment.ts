import type { EntityId, IsoDateTime } from "./task.js";

export interface Attachment {
  id: EntityId;
  taskId: EntityId;
  description: string;
  url: string;
  type?: string;
  position: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateAttachmentInput {
  description: string;
  url: string;
  type?: string;
}

export interface UpdateAttachmentInput {
  description?: string;
  url?: string;
  type?: string | null;
}

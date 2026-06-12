import { vi } from "vitest";
import type { Attachment } from "../domain/attachment.js";
import type { Comment } from "../domain/comment.js";
import type { Task, TaskListQuery } from "../domain/task.js";
import type { Database } from "../repositories/database.js";
import type { IdRepository } from "../repositories/idRepository.js";
import type { TaskRepository } from "../repositories/taskRepository.js";
import type { AttachmentRepository } from "../repositories/attachmentRepository.js";
import type { CommentRepository } from "../repositories/commentRepository.js";

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? "1";
  return {
    id,
    title: `Task ${id}`,
    status: "todo",
    createdAt: "2026-06-05T10:00:00.000Z",
    attachments: [],
    comments: [],
    progressTracker: "manual",
    progress: 0,
    parentTaskIds: [],
    childTaskIds: [],
    blockedByTaskIds: [],
    updatedAt: "2026-06-05T10:00:00.000Z",
    ...overrides
  };
}

export function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  const id = overrides.id ?? "A";
  return {
    id,
    taskId: "1",
    description: `Attachment ${id}`,
    url: "file:///tmp/file.txt",
    position: 0,
    createdAt: "2026-06-05T10:00:00.000Z",
    updatedAt: "2026-06-05T10:00:00.000Z",
    ...overrides
  };
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  const id = overrides.id ?? "C";
  return {
    id,
    taskId: "1",
    body: `Comment ${id}`,
    position: 0,
    createdAt: "2026-06-05T10:00:00.000Z",
    updatedAt: "2026-06-05T10:00:00.000Z",
    ...overrides
  };
}

export function makeDatabaseMock(): Database {
  return {
    transaction: vi.fn(<T>(work: () => T): T => work())
  } as unknown as Database;
}

export function makeIdRepositoryMock(ids: string[]): IdRepository {
  const queue = [...ids];
  return {
    next: vi.fn((entityType: "task" | "attachment" | "comment") => {
      const id = queue.shift();
      if (!id) throw new Error("No mock ID available");
      return { id, sequenceValue: Number.parseInt(id, 36) || 1, entityType };
    })
  } as unknown as IdRepository;
}

export class MockTaskRepository {
  tasks = new Map<string, Task>();
  childMap = new Map<string, Set<string>>();
  parentMap = new Map<string, Set<string>>();
  blockerMap = new Map<string, Set<string>>();

  create = vi.fn((task: Omit<Task, "attachments" | "comments" | "parentTaskIds" | "childTaskIds" | "blockedByTaskIds">): void => {
    this.tasks.set(task.id, makeTask({ ...task, attachments: [], comments: [], parentTaskIds: [], childTaskIds: [], blockedByTaskIds: [] }));
  });

  update = vi.fn((id: string, patch: Partial<Task>): void => {
    const current = this.tasks.get(id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (patch.completedAt === null) delete next.completedAt;
    if (patch.description === null) delete next.description;
    this.tasks.set(id, next);
  });

  delete = vi.fn((id: string): void => {
    this.tasks.delete(id);
    for (const childIds of this.childMap.values()) childIds.delete(id);
    for (const parentIds of this.parentMap.values()) parentIds.delete(id);
    for (const blockerIds of this.blockerMap.values()) blockerIds.delete(id);
  });

  findById = vi.fn((id: string): Task | undefined => {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    return {
      ...task,
      comments: this.commentIds(id),
      parentTaskIds: this.parentIds(id),
      childTaskIds: this.childIds(id),
      blockedByTaskIds: this.blockedByIds(id)
    };
  });

  exists = vi.fn((id: string): boolean => this.tasks.has(id));

  list = vi.fn((_query: TaskListQuery): { items: Task[]; nextCursor?: string } => ({
    items: [...this.tasks.keys()].map((id) => this.findById(id)!)
  }));

  addRelationship = vi.fn((parentTaskId: string, childTaskId: string): void => {
    if (!this.childMap.has(parentTaskId)) this.childMap.set(parentTaskId, new Set());
    if (!this.parentMap.has(childTaskId)) this.parentMap.set(childTaskId, new Set());
    this.childMap.get(parentTaskId)!.add(childTaskId);
    this.parentMap.get(childTaskId)!.add(parentTaskId);
  });

  removeRelationship = vi.fn((parentTaskId: string, childTaskId: string): void => {
    this.childMap.get(parentTaskId)?.delete(childTaskId);
    this.parentMap.get(childTaskId)?.delete(parentTaskId);
  });

  setBlockers = vi.fn((blockedTaskId: string, blockingTaskIds: string[]): void => {
    this.blockerMap.set(blockedTaskId, new Set(blockingTaskIds));
  });

  addBlocker = vi.fn((blockedTaskId: string, blockingTaskId: string): void => {
    if (!this.blockerMap.has(blockedTaskId)) this.blockerMap.set(blockedTaskId, new Set());
    this.blockerMap.get(blockedTaskId)!.add(blockingTaskId);
  });

  removeBlocker = vi.fn((blockedTaskId: string, blockingTaskId: string): void => {
    this.blockerMap.get(blockedTaskId)?.delete(blockingTaskId);
  });

  parentIds = vi.fn((childTaskId: string): string[] => [...(this.parentMap.get(childTaskId) ?? [])].sort());
  childIds = vi.fn((parentTaskId: string): string[] => [...(this.childMap.get(parentTaskId) ?? [])].sort());
  blockedByIds = vi.fn((blockedTaskId: string): string[] => [...(this.blockerMap.get(blockedTaskId) ?? [])].sort());
  attachmentIds = vi.fn((_taskId: string): string[] => []);
  commentIds = vi.fn((_taskId: string): string[] => []);

  asRepository(): TaskRepository {
    return this as unknown as TaskRepository;
  }
}

export class MockAttachmentRepository {
  attachments = new Map<string, Attachment>();

  create = vi.fn((attachment: Attachment): void => {
    this.attachments.set(attachment.id, attachment);
  });

  update = vi.fn((id: string, patch: Partial<Attachment> & { type?: string | null }): void => {
    const current = this.attachments.get(id);
    if (!current) return;
    this.attachments.set(id, { ...current, ...patch, type: patch.type === null ? undefined : (patch.type ?? current.type) });
  });

  delete = vi.fn((id: string): void => {
    this.attachments.delete(id);
  });

  findById = vi.fn((id: string): Attachment | undefined => this.attachments.get(id));

  listForTask = vi.fn((taskId: string): Attachment[] =>
    [...this.attachments.values()].filter((attachment) => attachment.taskId === taskId).sort((a, b) => a.position - b.position)
  );

  nextPosition = vi.fn((taskId: string): number => this.listForTask(taskId).length);

  reorder = vi.fn((taskId: string, attachmentIds: string[]): void => {
    attachmentIds.forEach((id, position) => {
      const attachment = this.attachments.get(id);
      if (attachment && attachment.taskId === taskId) this.attachments.set(id, { ...attachment, position });
    });
  });

  normalizePositions = vi.fn((taskId: string): void => {
    this.listForTask(taskId).forEach((attachment, position) => {
      this.attachments.set(attachment.id, { ...attachment, position });
    });
  });

  asRepository(): AttachmentRepository {
    return this as unknown as AttachmentRepository;
  }
}

export class MockCommentRepository {
  comments = new Map<string, Comment>();

  create = vi.fn((comment: Comment): void => {
    this.comments.set(comment.id, comment);
  });

  update = vi.fn((id: string, patch: Partial<Comment>): void => {
    const current = this.comments.get(id);
    if (!current) return;
    this.comments.set(id, { ...current, ...patch });
  });

  delete = vi.fn((id: string): void => {
    this.comments.delete(id);
  });

  findById = vi.fn((id: string): Comment | undefined => this.comments.get(id));

  listForTask = vi.fn((taskId: string): Comment[] =>
    [...this.comments.values()].filter((comment) => comment.taskId === taskId).sort((a, b) => a.position - b.position)
  );

  nextPosition = vi.fn((taskId: string): number => this.listForTask(taskId).length);

  reorder = vi.fn((taskId: string, commentIds: string[]): void => {
    commentIds.forEach((id, position) => {
      const comment = this.comments.get(id);
      if (comment && comment.taskId === taskId) this.comments.set(id, { ...comment, position });
    });
  });

  normalizePositions = vi.fn((taskId: string): void => {
    this.listForTask(taskId).forEach((comment, position) => {
      this.comments.set(comment.id, { ...comment, position });
    });
  });

  asRepository(): CommentRepository {
    return this as unknown as CommentRepository;
  }
}

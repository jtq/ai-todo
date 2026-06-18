import { z } from "zod";
import {
  deadlineSchema,
  entityIdSchema,
  progressTrackerSchema,
  taskUrgencySchema,
  taskStatusSchema,
  utcDateTimeSchema
} from "./commonSchemas.js";

export const createTaskSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    status: taskStatusSchema.default("todo"),
    urgency: taskUrgencySchema.default("medium"),
    deadline: deadlineSchema.optional(),
    progressTracker: progressTrackerSchema.default("manual"),
    progress: z.number().min(0).max(1).optional(),
    parentTaskId: entityIdSchema.optional(),
    childTaskIds: z.array(entityIdSchema).default([]),
    blockedByTaskIds: z.array(entityIdSchema).default([])
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.progressTracker === "computed_from_subtasks" && value.progress !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["progress"],
        message: "progress cannot be set when progressTracker is computed_from_subtasks"
      });
    }
  })
  .transform((value) => ({
    ...value,
    progress: value.progressTracker === "manual" ? (value.progress ?? 0) : 0,
    childTaskIds: [...new Set(value.childTaskIds)],
    blockedByTaskIds: [...new Set(value.blockedByTaskIds)]
  }));

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    urgency: taskUrgencySchema.optional(),
    completedAt: utcDateTimeSchema.nullable().optional(),
    deadline: deadlineSchema.nullable().optional(),
    progressTracker: progressTrackerSchema.optional(),
    progress: z.number().min(0).max(1).optional(),
    blockedByTaskIds: z.array(entityIdSchema).optional()
  })
  .strict()
  .transform((value) => ({
    ...value,
    blockedByTaskIds: value.blockedByTaskIds ? [...new Set(value.blockedByTaskIds)] : undefined
  }));

export const listTasksQuerySchema = z
  .object({
    status: taskStatusSchema.optional(),
    urgency: taskUrgencySchema.optional(),
    parentTaskId: entityIdSchema.optional(),
    childTaskId: entityIdSchema.optional(),
    blockedByTaskId: entityIdSchema.optional(),
    hasDeadline: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
    deadlineBefore: z.string().optional(),
    deadlineAfter: z.string().optional(),
    createdBefore: utcDateTimeSchema.optional(),
    createdAfter: utcDateTimeSchema.optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: entityIdSchema.optional(),
    sort: z
      .enum([
        "created_at_asc",
        "created_at_desc",
        "deadline_asc",
        "deadline_desc",
        "title_asc",
        "status_asc",
        "urgency_asc",
        "urgency_desc"
      ])
      .default("created_at_desc")
  })
  .strict();

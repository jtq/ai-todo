import { z } from "zod";
import { assertDateOnly, assertUtcDateTime } from "../domain/datetime.js";

export const entityIdSchema = z.string().min(1);
export const taskStatusSchema = z.enum(["draft", "todo", "in_progress", "on_hold", "completed", "wont_do"]);
export const taskUrgencySchema = z.enum(["critical", "urgent", "medium", "low", "whenever"]);
export const progressTrackerSchema = z.enum(["computed_from_subtasks", "manual"]);

export const utcDateTimeSchema = z.string().superRefine((value, ctx) => {
  try {
    assertUtcDateTime(value, "datetime");
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a UTC ISO 8601 datetime ending in Z" });
  }
});

export const dateOnlySchema = z.string().superRefine((value, ctx) => {
  try {
    assertDateOnly(value, "date");
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a valid YYYY-MM-DD date" });
  }
});

export const deadlineSchema = z.union([
  z.object({ kind: z.literal("date"), date: dateOnlySchema }).strict(),
  z.object({ kind: z.literal("datetime"), datetime: utcDateTimeSchema }).strict()
]);

export function zodDetails(error: z.ZodError): unknown {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

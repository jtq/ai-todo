import { z } from "zod";
import { entityIdSchema } from "./commonSchemas.js";

const urlSchema = z.string().min(1).superRefine((value, ctx) => {
  try {
    new URL(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a valid URL, using file:// for local files" });
  }
});

export const createAttachmentSchema = z
  .object({
    description: z.string().min(1),
    url: urlSchema,
    type: z.string().min(1).optional()
  })
  .strict();

export const updateAttachmentSchema = z
  .object({
    description: z.string().min(1).optional(),
    url: urlSchema.optional(),
    type: z.string().min(1).nullable().optional()
  })
  .strict();

export const reorderAttachmentsSchema = z
  .object({
    attachmentIds: z.array(entityIdSchema)
  })
  .strict();

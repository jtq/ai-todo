import { z } from "zod";
import { entityIdSchema } from "./commonSchemas.js";

export const createCommentSchema = z
  .object({
    body: z.string().min(1)
  })
  .strict();

export const updateCommentSchema = z
  .object({
    body: z.string().min(1).optional()
  })
  .strict();

export const reorderCommentsSchema = z
  .object({
    commentIds: z.array(entityIdSchema)
  })
  .strict();

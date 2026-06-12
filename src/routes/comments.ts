import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParam, parseWithSchema, sendNoContent } from "../app.js";
import type { CommentService } from "../services/commentService.js";
import { createCommentSchema, reorderCommentsSchema, updateCommentSchema } from "../validation/commentSchemas.js";

const taskCommentParamsSchema = z.object({
  id: z.string().min(1)
});

export function registerCommentRoutes(app: FastifyInstance, comments: CommentService): void {
  app.post("/api/v1/tasks/:id/comments", async (request, reply) => {
    const params = parseWithSchema(taskCommentParamsSchema, request.params);
    const input = parseWithSchema(createCommentSchema, request.body);
    return reply.status(201).send(comments.create(params.id, input));
  });

  app.get("/api/v1/comments/:id", async (request) => comments.get(idParam(request, "id")));

  app.patch("/api/v1/comments/:id", async (request) => {
    const input = parseWithSchema(updateCommentSchema, request.body);
    return comments.update(idParam(request, "id"), input);
  });

  app.delete("/api/v1/comments/:id", async (request, reply) => {
    comments.delete(idParam(request, "id"));
    await sendNoContent(reply);
  });

  app.patch("/api/v1/tasks/:id/comments/order", async (request) => {
    const params = parseWithSchema(taskCommentParamsSchema, request.params);
    const input = parseWithSchema(reorderCommentsSchema, request.body);
    return { items: comments.reorder(params.id, input.commentIds) };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParam, parseWithSchema, sendNoContent } from "../app.js";
import type { AttachmentService } from "../services/attachmentService.js";
import {
  createAttachmentSchema,
  reorderAttachmentsSchema,
  updateAttachmentSchema
} from "../validation/attachmentSchemas.js";

const taskAttachmentParamsSchema = z.object({
  id: z.string().min(1)
});

export function registerAttachmentRoutes(app: FastifyInstance, attachments: AttachmentService): void {
  app.post("/api/v1/tasks/:id/attachments", async (request, reply) => {
    const params = parseWithSchema(taskAttachmentParamsSchema, request.params);
    const input = parseWithSchema(createAttachmentSchema, request.body);
    return reply.status(201).send(attachments.create(params.id, input));
  });

  app.get("/api/v1/attachments/:id", async (request) => attachments.get(idParam(request, "id")));

  app.patch("/api/v1/attachments/:id", async (request) => {
    const input = parseWithSchema(updateAttachmentSchema, request.body);
    return attachments.update(idParam(request, "id"), input);
  });

  app.delete("/api/v1/attachments/:id", async (request, reply) => {
    attachments.delete(idParam(request, "id"));
    await sendNoContent(reply);
  });

  app.patch("/api/v1/tasks/:id/attachments/order", async (request) => {
    const params = parseWithSchema(taskAttachmentParamsSchema, request.params);
    const input = parseWithSchema(reorderAttachmentsSchema, request.body);
    return { items: attachments.reorder(params.id, input.attachmentIds) };
  });
}

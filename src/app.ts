import swagger from "@fastify/swagger";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError, validationError } from "./domain/errors.js";
import type { AppConfig } from "./config/env.js";
import { Database } from "./repositories/database.js";
import { IdRepository } from "./repositories/idRepository.js";
import { TaskRepository } from "./repositories/taskRepository.js";
import { AttachmentRepository } from "./repositories/attachmentRepository.js";
import { CommentRepository } from "./repositories/commentRepository.js";
import { TaskService } from "./services/taskService.js";
import { AttachmentService } from "./services/attachmentService.js";
import { CommentService } from "./services/commentService.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { openApiDocument } from "./openapi.js";

export interface AppContext {
  database: Database;
  tasks: TaskService;
  attachments: AttachmentService;
  comments: CommentService;
}

export async function buildApp(config: AppConfig): Promise<{ app: FastifyInstance; context: AppContext }> {
  const app = Fastify({ logger: config.nodeEnv !== "test" });
  const database = new Database(config);
  const ids = new IdRepository(database);
  const taskRepository = new TaskRepository(database);
  const attachmentRepository = new AttachmentRepository(database);
  const commentRepository = new CommentRepository(database);
  const tasks = new TaskService(database, ids, taskRepository);
  const attachments = new AttachmentService(database, ids, attachmentRepository, taskRepository);
  const comments = new CommentService(database, ids, commentRepository, taskRepository);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "AI Todo Backend API",
        version: "0.1.0"
      },
      openapi: "3.1.0"
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: "internal_error", message: "Internal server error" } });
  });

  app.get("/health", async () => ({ status: "ok", persistence: "ok" }));
  app.get("/openapi.json", async () => openApiDocument);

  registerTaskRoutes(app, tasks);
  registerAttachmentRoutes(app, attachments);
  registerCommentRoutes(app, comments);

  app.addHook("onClose", async () => {
    database.close();
  });

  return { app, context: { database, tasks, attachments, comments } };
}

export function parseWithSchema<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      "Request validation failed",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    );
  }
  return result.data;
}

export function idParam(request: FastifyRequest, name: string): string {
  const params = request.params as Record<string, string | undefined>;
  const value = params[name];
  if (!value) throw validationError(`${name} is required`);
  return value;
}

export async function sendNoContent(reply: FastifyReply): Promise<void> {
  reply.status(204).send();
}

export const idParamsSchema = z.object({ id: z.string().min(1) }).passthrough();

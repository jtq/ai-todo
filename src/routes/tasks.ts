import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParam, parseWithSchema, sendNoContent } from "../app.js";
import type { TaskService } from "../services/taskService.js";
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from "../validation/taskSchemas.js";

const relationParamsSchema = z.object({
  id: z.string().min(1),
  parentTaskId: z.string().min(1).optional(),
  childTaskId: z.string().min(1).optional(),
  blockingTaskId: z.string().min(1).optional()
});

export function registerTaskRoutes(app: FastifyInstance, tasks: TaskService): void {
  app.post("/api/v1/tasks", async (request, reply) => {
    const input = parseWithSchema(createTaskSchema, request.body);
    const task = tasks.create(input);
    return reply.status(201).send(task);
  });

  app.get("/api/v1/tasks", async (request) => {
    const query = parseWithSchema(listTasksQuerySchema, request.query);
    return tasks.list(query);
  });

  app.get("/api/v1/tasks/:id", async (request) => tasks.get(idParam(request, "id")));

  app.patch("/api/v1/tasks/:id", async (request) => {
    const input = parseWithSchema(updateTaskSchema, request.body);
    return tasks.update(idParam(request, "id"), input);
  });

  app.delete("/api/v1/tasks/:id", async (request, reply) => {
    tasks.delete(idParam(request, "id"));
    await sendNoContent(reply);
  });

  app.put("/api/v1/tasks/:id/parents/:parentTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.addParent(params.id, params.parentTaskId!);
  });

  app.delete("/api/v1/tasks/:id/parents/:parentTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.removeParent(params.id, params.parentTaskId!);
  });

  app.put("/api/v1/tasks/:id/children/:childTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.addChild(params.id, params.childTaskId!);
  });

  app.delete("/api/v1/tasks/:id/children/:childTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.removeChild(params.id, params.childTaskId!);
  });

  app.put("/api/v1/tasks/:id/blocked-by/:blockingTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.addBlocker(params.id, params.blockingTaskId!);
  });

  app.delete("/api/v1/tasks/:id/blocked-by/:blockingTaskId", async (request) => {
    const params = parseWithSchema(relationParamsSchema, request.params);
    return tasks.removeBlocker(params.id, params.blockingTaskId!);
  });
}

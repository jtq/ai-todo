import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { withTestApp } from "./test/appTestUtils.js";

async function createTask(app: FastifyInstance, title: string, body: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    payload: { title, ...body }
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("API", () => {
  it("serves health and OpenAPI", async () => {
    await withTestApp(async (app) => {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: "ok", persistence: "ok" });

      const openapi = await app.inject({ method: "GET", url: "/openapi.json" });
      expect(openapi.statusCode).toBe(200);
      expect(openapi.json().paths["/api/v1/tasks"]).toBeTruthy();
    });
  });

  it("creates, retrieves, updates, lists, and deletes tasks", async () => {
    await withTestApp(async (app) => {
      const task = await createTask(app, "Write spec", { deadline: { kind: "date", date: "2026-06-10" } });
      expect(task.id).toBe("1");
      expect(task.status).toBe("todo");
      expect(task.deadline).toEqual({ kind: "date", date: "2026-06-10" });

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}`,
        payload: { status: "completed" }
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().completedAt).toMatch(/Z$/);
      expect(patch.json().progress).toBe(1);

      const list = await app.inject({ method: "GET", url: "/api/v1/tasks?status=completed" });
      expect(list.statusCode).toBe(200);
      expect(list.json().items).toHaveLength(1);

      const del = await app.inject({ method: "DELETE", url: `/api/v1/tasks/${task.id}` });
      expect(del.statusCode).toBe(204);
      const missing = await app.inject({ method: "GET", url: `/api/v1/tasks/${task.id}` });
      expect(missing.statusCode).toBe(404);
    });
  });

  it("rejects non-UTC datetime inputs", async () => {
    await withTestApp(async (app) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        payload: { title: "Bad time", deadline: { kind: "datetime", datetime: "2026-06-03T10:30:00" } }
      });
      expect(response.statusCode).toBe(422);
    });
  });

  it("keeps parent child relationships reciprocal and rejects cycles", async () => {
    await withTestApp(async (app) => {
      const parent = await createTask(app, "Parent", { progressTracker: "computed_from_subtasks" });
      const child = await createTask(app, "Child");

      const linked = await app.inject({ method: "PUT", url: `/api/v1/tasks/${parent.id}/children/${child.id}` });
      expect(linked.statusCode).toBe(200);
      expect(linked.json().childTaskIds).toEqual([child.id]);

      const childResponse = await app.inject({ method: "GET", url: `/api/v1/tasks/${child.id}` });
      expect(childResponse.json().parentTaskIds).toEqual([parent.id]);

      const cycle = await app.inject({ method: "PUT", url: `/api/v1/tasks/${child.id}/children/${parent.id}` });
      expect(cycle.statusCode).toBe(409);
    });
  });

  it("computes progress from direct subtasks", async () => {
    await withTestApp(async (app) => {
      const parent = await createTask(app, "Parent", { progressTracker: "computed_from_subtasks" });
      const a = await createTask(app, "A", { progress: 0.25 });
      const b = await createTask(app, "B", { progress: 0.75 });
      await app.inject({ method: "PUT", url: `/api/v1/tasks/${parent.id}/children/${a.id}` });
      const linked = await app.inject({ method: "PUT", url: `/api/v1/tasks/${parent.id}/children/${b.id}` });
      expect(linked.json().progress).toBe(0.5);

      await app.inject({ method: "PATCH", url: `/api/v1/tasks/${a.id}`, payload: { status: "completed" } });
      const updated = await app.inject({ method: "GET", url: `/api/v1/tasks/${parent.id}` });
      expect(updated.json().progress).toBe(0.875);
    });
  });

  it("manages task-owned attachments in order", async () => {
    await withTestApp(async (app) => {
      const firstTask = await createTask(app, "First task");
      const secondTask = await createTask(app, "Second task");
      const a = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${firstTask.id}/attachments`,
        payload: { description: "Local", url: "file:///tmp/a.txt", type: "text/plain" }
      });
      const b = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${firstTask.id}/attachments`,
        payload: { description: "Remote", url: "https://example.com/b" }
      });
      const other = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${secondTask.id}/attachments`,
        payload: { description: "Other", url: "https://example.com/other" }
      });

      expect(a.statusCode).toBe(201);
      expect(a.json().taskId).toBe(firstTask.id);
      expect(b.json().position).toBe(1);

      const reordered = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${firstTask.id}/attachments/order`,
        payload: { attachmentIds: [b.json().id, a.json().id] }
      });
      expect(reordered.statusCode).toBe(200);
      expect(reordered.json().items.map((item: { id: string }) => item.id)).toEqual([b.json().id, a.json().id]);

      const crossTask = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${firstTask.id}/attachments/order`,
        payload: { attachmentIds: [b.json().id, other.json().id] }
      });
      expect(crossTask.statusCode).toBe(409);
    });
  });
});

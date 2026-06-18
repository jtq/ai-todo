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
      expect(openapi.json().paths["/api/v1/tasks/{id}/comments"]).toBeTruthy();
      expect(openapi.json().paths["/api/v1/comments/{id}"]).toBeTruthy();
      expect(openapi.json().components.schemas.TaskStatus.enum).toContain("on_hold");
      expect(openapi.json().components.schemas.TaskStatus.enum).toContain("wont_do");
      expect(openapi.json().components.schemas.TaskUrgency.enum).toEqual(["critical", "urgent", "medium", "low", "whenever"]);
      expect(openapi.json().components.schemas.Task.properties.comments).toBeTruthy();
      expect(openapi.json().components.schemas.Task.properties.urgency).toBeTruthy();
      expect(openapi.json().components.schemas.Comment).toBeTruthy();
      expect(openapi.json().paths["/api/v1/tasks"].post.requestBody.content["application/json"].schema.$ref).toBe(
        "#/components/schemas/CreateTaskRequest"
      );
      expect(openapi.json().paths["/api/v1/tasks/{id}"].patch.requestBody.content["application/json"].example.status).toBe(
        "in_progress"
      );
      expect(openapi.json().paths["/api/v1/tasks/{id}"].patch.requestBody.content["application/json"].example.urgency).toBe("critical");
      expect(
        openapi.json().paths["/api/v1/tasks/{id}/attachments/order"].patch.requestBody.content["application/json"].schema.$ref
      ).toBe("#/components/schemas/ReorderTaskAttachmentsRequest");
      expect(openapi.json().paths["/api/v1/tasks/{id}/comments"].post.requestBody.content["application/json"].example.body).toBeTruthy();
      expect(
        openapi.json().paths["/api/v1/tasks/{id}/comments/order"].patch.requestBody.content["application/json"].schema.$ref
      ).toBe("#/components/schemas/ReorderTaskCommentsRequest");
      expect(openapi.json().components.schemas.CreateAttachmentRequest.required).toEqual(["description", "url"]);
      expect(openapi.json().components.schemas.CreateCommentRequest.required).toEqual(["body"]);
    });
  });

  it("creates, retrieves, updates, lists, and deletes tasks", async () => {
    await withTestApp(async (app) => {
      const task = await createTask(app, "Write spec", { deadline: { kind: "date", date: "2026-06-10" } });
      expect(task.id).toBe("1");
      expect(task.status).toBe("todo");
      expect(task.urgency).toBe("medium");
      expect(task.deadline).toEqual({ kind: "date", date: "2026-06-10" });

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}`,
        payload: { status: "completed", urgency: "critical" }
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().urgency).toBe("critical");
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

  it("supports on_hold and wont_do task statuses", async () => {
    await withTestApp(async (app) => {
      const held = await createTask(app, "Paused", { status: "on_hold" });
      expect(held.status).toBe("on_hold");

      const wontDo = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${held.id}`,
        payload: { status: "wont_do" }
      });
      expect(wontDo.statusCode).toBe(200);
      expect(wontDo.json().status).toBe("wont_do");

      const list = await app.inject({ method: "GET", url: "/api/v1/tasks?status=wont_do" });
      expect(list.statusCode).toBe(200);
      expect(list.json().items).toHaveLength(1);
      expect(list.json().items[0].status).toBe("wont_do");
    });
  });

  it("supports task urgency values, filtering, and urgency sorting", async () => {
    await withTestApp(async (app) => {
      const low = await createTask(app, "Low urgency", { urgency: "low" });
      const critical = await createTask(app, "Critical urgency", { urgency: "critical" });
      const whenever = await createTask(app, "Whenever urgency", { urgency: "whenever" });

      expect(low.urgency).toBe("low");
      expect(critical.urgency).toBe("critical");
      expect(whenever.urgency).toBe("whenever");

      const filtered = await app.inject({ method: "GET", url: "/api/v1/tasks?urgency=critical" });
      expect(filtered.statusCode).toBe(200);
      expect(filtered.json().items.map((item: { id: string }) => item.id)).toEqual([critical.id]);

      const sorted = await app.inject({ method: "GET", url: "/api/v1/tasks?sort=urgency_desc" });
      expect(sorted.statusCode).toBe(200);
      expect(sorted.json().items.map((item: { urgency: string }) => item.urgency)).toEqual(["critical", "low", "whenever"]);
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
      expect(childResponse.json().parentTaskId).toBe(parent.id);

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

  it("switches manual tasks to computed progress through the API", async () => {
    await withTestApp(async (app) => {
      const task = await createTask(app, "Manual parent", { progressTracker: "manual", progress: 0.5 });

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}`,
        payload: { progressTracker: "computed_from_subtasks" }
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json().progressTracker).toBe("computed_from_subtasks");
      expect(updated.json().progress).toBe(0);
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

  it("allows only one parent task and replaces the previous parent", async () => {
    await withTestApp(async (app) => {
      const oldParent = await createTask(app, "Old parent");
      const newParent = await createTask(app, "New parent");
      const child = await createTask(app, "Child");

      const first = await app.inject({ method: "PUT", url: `/api/v1/tasks/${child.id}/parent/${oldParent.id}` });
      expect(first.statusCode).toBe(200);
      expect(first.json().parentTaskId).toBe(oldParent.id);

      const second = await app.inject({ method: "PUT", url: `/api/v1/tasks/${child.id}/parent/${newParent.id}` });
      expect(second.statusCode).toBe(200);
      expect(second.json().parentTaskId).toBe(newParent.id);

      const oldParentResponse = await app.inject({ method: "GET", url: `/api/v1/tasks/${oldParent.id}` });
      expect(oldParentResponse.json().childTaskIds).toEqual([]);
      const newParentResponse = await app.inject({ method: "GET", url: `/api/v1/tasks/${newParent.id}` });
      expect(newParentResponse.json().childTaskIds).toEqual([child.id]);
    });
  });

  it("manages task-owned comments in order", async () => {
    await withTestApp(async (app) => {
      const firstTask = await createTask(app, "First task");
      const secondTask = await createTask(app, "Second task");
      const a = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${firstTask.id}/comments`,
        payload: { body: "Initial progress update" }
      });
      const b = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${firstTask.id}/comments`,
        payload: { body: "More context" }
      });
      const other = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${secondTask.id}/comments`,
        payload: { body: "Other task context" }
      });

      expect(a.statusCode).toBe(201);
      expect(a.json().taskId).toBe(firstTask.id);
      expect(b.json().position).toBe(1);

      const task = await app.inject({ method: "GET", url: `/api/v1/tasks/${firstTask.id}` });
      expect(task.json().comments).toEqual([a.json().id, b.json().id]);

      const fetched = await app.inject({ method: "GET", url: `/api/v1/comments/${a.json().id}` });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().body).toBe("Initial progress update");

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/comments/${a.json().id}`,
        payload: { body: "Updated progress update" }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().body).toBe("Updated progress update");

      const reordered = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${firstTask.id}/comments/order`,
        payload: { commentIds: [b.json().id, a.json().id] }
      });
      expect(reordered.statusCode).toBe(200);
      expect(reordered.json().items.map((item: { id: string }) => item.id)).toEqual([b.json().id, a.json().id]);

      const duplicate = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${firstTask.id}/comments/order`,
        payload: { commentIds: [a.json().id, a.json().id] }
      });
      expect(duplicate.statusCode).toBe(422);

      const crossTask = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${firstTask.id}/comments/order`,
        payload: { commentIds: [b.json().id, other.json().id] }
      });
      expect(crossTask.statusCode).toBe(409);

      const badCreate = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${firstTask.id}/comments`,
        payload: { body: "" }
      });
      expect(badCreate.statusCode).toBe(422);

      const deleted = await app.inject({ method: "DELETE", url: `/api/v1/comments/${a.json().id}` });
      expect(deleted.statusCode).toBe(204);
      const missing = await app.inject({ method: "GET", url: `/api/v1/comments/${a.json().id}` });
      expect(missing.statusCode).toBe(404);
    });
  });
});

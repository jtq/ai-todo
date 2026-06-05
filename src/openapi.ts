export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AI Todo Backend API",
    version: "0.1.0"
  },
  paths: {
    "/health": { get: { responses: { "200": { description: "Service health" } } } },
    "/openapi.json": { get: { responses: { "200": { description: "OpenAPI document" } } } },
    "/api/v1/tasks": {
      post: { summary: "Create task", responses: { "201": { description: "Created task" } } },
      get: { summary: "List tasks", responses: { "200": { description: "Task list" } } }
    },
    "/api/v1/tasks/{id}": {
      get: { summary: "Get task", responses: { "200": { description: "Task" }, "404": { description: "Missing task" } } },
      patch: { summary: "Update task", responses: { "200": { description: "Updated task" } } },
      delete: { summary: "Delete task", responses: { "204": { description: "Deleted task" } } }
    },
    "/api/v1/tasks/{id}/parents/{parentTaskId}": {
      put: { summary: "Add parent relationship", responses: { "200": { description: "Updated task" } } },
      delete: { summary: "Remove parent relationship", responses: { "200": { description: "Updated task" } } }
    },
    "/api/v1/tasks/{id}/children/{childTaskId}": {
      put: { summary: "Add child relationship", responses: { "200": { description: "Updated task" } } },
      delete: { summary: "Remove child relationship", responses: { "200": { description: "Updated task" } } }
    },
    "/api/v1/tasks/{id}/blocked-by/{blockingTaskId}": {
      put: { summary: "Add blocking relationship", responses: { "200": { description: "Updated task" } } },
      delete: { summary: "Remove blocking relationship", responses: { "200": { description: "Updated task" } } }
    },
    "/api/v1/tasks/{id}/attachments": {
      post: { summary: "Create task-owned attachment", responses: { "201": { description: "Created attachment" } } }
    },
    "/api/v1/attachments/{id}": {
      get: { summary: "Get attachment", responses: { "200": { description: "Attachment" } } },
      patch: { summary: "Update attachment", responses: { "200": { description: "Updated attachment" } } },
      delete: { summary: "Delete attachment", responses: { "204": { description: "Deleted attachment" } } }
    },
    "/api/v1/tasks/{id}/attachments/order": {
      patch: { summary: "Reorder task-owned attachments", responses: { "200": { description: "Attachment list" } } }
    }
  },
  components: {
    schemas: {
      Task: {
        type: "object",
        required: ["id", "title", "status", "createdAt", "attachments", "progressTracker", "progress"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { enum: ["draft", "todo", "in_progress", "completed"] },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          deadline: { oneOf: [{ $ref: "#/components/schemas/DateDeadline" }, { $ref: "#/components/schemas/DateTimeDeadline" }] },
          attachments: { type: "array", items: { type: "string" } },
          progressTracker: { enum: ["computed_from_subtasks", "manual"] },
          progress: { type: "number", minimum: 0, maximum: 1 },
          parentTaskIds: { type: "array", items: { type: "string" } },
          childTaskIds: { type: "array", items: { type: "string" } },
          blockedByTaskIds: { type: "array", items: { type: "string" } },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Attachment: {
        type: "object",
        required: ["id", "taskId", "description", "url", "position", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          taskId: { type: "string" },
          description: { type: "string" },
          url: { type: "string", format: "uri" },
          type: { type: "string" },
          position: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      DateDeadline: {
        type: "object",
        required: ["kind", "date"],
        properties: { kind: { const: "date" }, date: { type: "string", format: "date" } }
      },
      DateTimeDeadline: {
        type: "object",
        required: ["kind", "datetime"],
        properties: { kind: { const: "datetime" }, datetime: { type: "string", format: "date-time" } }
      },
      ApiError: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: { code: { type: "string" }, message: { type: "string" }, details: {} }
          }
        }
      }
    }
  }
};

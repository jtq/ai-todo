const jsonContent = (schema: unknown, example?: unknown) => ({
  "application/json": {
    schema,
    ...(example === undefined ? {} : { example })
  }
});

const response = (description: string, schema?: unknown, example?: unknown) => ({
  description,
  ...(schema ? { content: jsonContent(schema, example) } : {})
});

const requestBody = (schema: unknown, example: unknown) => ({
  required: true,
  content: jsonContent(schema, example)
});

const pathId = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", minLength: 1 }
});

const taskRef = { $ref: "#/components/schemas/Task" };
const attachmentRef = { $ref: "#/components/schemas/Attachment" };
const commentRef = { $ref: "#/components/schemas/Comment" };
const apiErrorRef = { $ref: "#/components/schemas/ApiError" };

const commonErrors = {
  "400": response("Bad request", apiErrorRef),
  "404": response("Resource not found", apiErrorRef),
  "409": response("Conflict", apiErrorRef),
  "422": response("Validation error", apiErrorRef),
  "500": response("Internal server error", apiErrorRef)
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AI Todo Backend API",
    version: "0.1.0"
  },
  paths: {
    "/health": {
      get: {
        summary: "Get service health",
        responses: { "200": response("Service health", { type: "object" }, { status: "ok", persistence: "ok" }) }
      }
    },
    "/openapi.json": {
      get: { summary: "Get OpenAPI document", responses: { "200": response("OpenAPI document") } }
    },
    "/api/v1/tasks": {
      post: {
        summary: "Create task",
        requestBody: requestBody({ $ref: "#/components/schemas/CreateTaskRequest" }, {
          title: "Renew passport",
          description: "Collect documents and submit renewal.",
          status: "todo",
          deadline: { kind: "date", date: "2026-06-30" },
          progressTracker: "manual",
          progress: 0.25,
          parentTaskId: "1",
          childTaskIds: [],
          blockedByTaskIds: []
        }),
        responses: { "201": response("Created task", taskRef), ...commonErrors }
      },
      get: {
        summary: "List tasks",
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/TaskStatus" } },
          { name: "parentTaskId", in: "query", schema: { type: "string" } },
          { name: "childTaskId", in: "query", schema: { type: "string" } },
          { name: "blockedByTaskId", in: "query", schema: { type: "string" } },
          { name: "hasDeadline", in: "query", schema: { type: "boolean" } },
          { name: "deadlineBefore", in: "query", schema: { type: "string" } },
          { name: "deadlineAfter", in: "query", schema: { type: "string" } },
          { name: "createdBefore", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "createdAfter", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { $ref: "#/components/schemas/TaskSort" } }
        ],
        responses: {
          "200": response("Task list", { $ref: "#/components/schemas/TaskListResponse" }),
          ...commonErrors
        }
      }
    },
    "/api/v1/tasks/{id}": {
      get: {
        summary: "Get task",
        parameters: [pathId("id", "Task ID")],
        responses: { "200": response("Task", taskRef), ...commonErrors }
      },
      patch: {
        summary: "Update task",
        parameters: [pathId("id", "Task ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/UpdateTaskRequest" }, {
          status: "in_progress",
          progress: 0.5,
          deadline: { kind: "datetime", datetime: "2026-06-30T17:00:00.000Z" },
          blockedByTaskIds: ["2"]
        }),
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      },
      delete: {
        summary: "Delete task",
        parameters: [pathId("id", "Task ID")],
        responses: { "204": response("Deleted task"), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/parent/{parentTaskId}": {
      put: {
        summary: "Set parent relationship",
        description: "Sets the task's single parent. If the task already has a parent, it is replaced.",
        parameters: [pathId("id", "Child task ID"), pathId("parentTaskId", "Parent task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      },
      delete: {
        summary: "Remove parent relationship",
        parameters: [pathId("id", "Child task ID"), pathId("parentTaskId", "Parent task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/children/{childTaskId}": {
      put: {
        summary: "Add child relationship",
        parameters: [pathId("id", "Parent task ID"), pathId("childTaskId", "Child task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      },
      delete: {
        summary: "Remove child relationship",
        parameters: [pathId("id", "Parent task ID"), pathId("childTaskId", "Child task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/blocked-by/{blockingTaskId}": {
      put: {
        summary: "Add blocking relationship",
        parameters: [pathId("id", "Blocked task ID"), pathId("blockingTaskId", "Blocking task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      },
      delete: {
        summary: "Remove blocking relationship",
        parameters: [pathId("id", "Blocked task ID"), pathId("blockingTaskId", "Blocking task ID")],
        responses: { "200": response("Updated task", taskRef), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/attachments": {
      post: {
        summary: "Create task-owned attachment",
        parameters: [pathId("id", "Owning task ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/CreateAttachmentRequest" }, {
          description: "Passport photo requirements",
          url: "file:///C:/Users/james/Documents/passport-photo.pdf",
          type: "application/pdf"
        }),
        responses: { "201": response("Created attachment", attachmentRef), ...commonErrors }
      }
    },
    "/api/v1/attachments/{id}": {
      get: {
        summary: "Get attachment",
        parameters: [pathId("id", "Attachment ID")],
        responses: { "200": response("Attachment", attachmentRef), ...commonErrors }
      },
      patch: {
        summary: "Update attachment",
        parameters: [pathId("id", "Attachment ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/UpdateAttachmentRequest" }, {
          description: "Updated reference document",
          url: "https://example.com/reference.pdf",
          type: "application/pdf"
        }),
        responses: { "200": response("Updated attachment", attachmentRef), ...commonErrors }
      },
      delete: {
        summary: "Delete attachment",
        parameters: [pathId("id", "Attachment ID")],
        responses: { "204": response("Deleted attachment"), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/attachments/order": {
      patch: {
        summary: "Reorder task-owned attachments",
        parameters: [pathId("id", "Owning task ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/ReorderTaskAttachmentsRequest" }, {
          attachmentIds: ["3", "2"]
        }),
        responses: {
          "200": response("Attachment list", { $ref: "#/components/schemas/AttachmentListResponse" }),
          ...commonErrors
        }
      }
    },
    "/api/v1/tasks/{id}/comments": {
      post: {
        summary: "Create task-owned comment",
        parameters: [pathId("id", "Owning task ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/CreateCommentRequest" }, {
          body: "Waiting for the passport office to confirm receipt."
        }),
        responses: { "201": response("Created comment", commentRef), ...commonErrors }
      }
    },
    "/api/v1/comments/{id}": {
      get: {
        summary: "Get comment",
        parameters: [pathId("id", "Comment ID")],
        responses: { "200": response("Comment", commentRef), ...commonErrors }
      },
      patch: {
        summary: "Update comment",
        parameters: [pathId("id", "Comment ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/UpdateCommentRequest" }, {
          body: "Passport office confirmed receipt; waiting for processing."
        }),
        responses: { "200": response("Updated comment", commentRef), ...commonErrors }
      },
      delete: {
        summary: "Delete comment",
        parameters: [pathId("id", "Comment ID")],
        responses: { "204": response("Deleted comment"), ...commonErrors }
      }
    },
    "/api/v1/tasks/{id}/comments/order": {
      patch: {
        summary: "Reorder task-owned comments",
        parameters: [pathId("id", "Owning task ID")],
        requestBody: requestBody({ $ref: "#/components/schemas/ReorderTaskCommentsRequest" }, {
          commentIds: ["5", "4"]
        }),
        responses: {
          "200": response("Comment list", { $ref: "#/components/schemas/CommentListResponse" }),
          ...commonErrors
        }
      }
    }
  },
  components: {
    schemas: {
      TaskStatus: { enum: ["draft", "todo", "in_progress", "on_hold", "completed", "wont_do"] },
      ProgressTracker: { enum: ["computed_from_subtasks", "manual"] },
      TaskSort: { enum: ["created_at_asc", "created_at_desc", "deadline_asc", "deadline_desc", "title_asc", "status_asc"] },
      EntityIdArray: { type: "array", items: { type: "string", minLength: 1 } },
      Task: {
        type: "object",
        required: ["id", "title", "status", "createdAt", "attachments", "comments", "progressTracker", "progress"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { $ref: "#/components/schemas/TaskStatus" },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          deadline: { oneOf: [{ $ref: "#/components/schemas/DateDeadline" }, { $ref: "#/components/schemas/DateTimeDeadline" }] },
          attachments: { $ref: "#/components/schemas/EntityIdArray" },
          comments: { $ref: "#/components/schemas/EntityIdArray" },
          progressTracker: { $ref: "#/components/schemas/ProgressTracker" },
          progress: { type: "number", minimum: 0, maximum: 1 },
          parentTaskId: { type: "string" },
          childTaskIds: { $ref: "#/components/schemas/EntityIdArray" },
          blockedByTaskIds: { $ref: "#/components/schemas/EntityIdArray" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CreateTaskRequest: {
        type: "object",
        required: ["title"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          description: { type: "string" },
          status: { $ref: "#/components/schemas/TaskStatus", default: "todo" },
          deadline: { oneOf: [{ $ref: "#/components/schemas/DateDeadline" }, { $ref: "#/components/schemas/DateTimeDeadline" }] },
          progressTracker: { $ref: "#/components/schemas/ProgressTracker", default: "manual" },
          progress: { type: "number", minimum: 0, maximum: 1, default: 0 },
          parentTaskId: { type: "string", description: "Optional single parent task ID." },
          childTaskIds: { $ref: "#/components/schemas/EntityIdArray" },
          blockedByTaskIds: { $ref: "#/components/schemas/EntityIdArray" }
        },
        description: "Do not include progress when progressTracker is computed_from_subtasks."
      },
      UpdateTaskRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          description: { type: ["string", "null"] },
          status: { $ref: "#/components/schemas/TaskStatus" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          deadline: {
            oneOf: [{ $ref: "#/components/schemas/DateDeadline" }, { $ref: "#/components/schemas/DateTimeDeadline" }, { type: "null" }]
          },
          progressTracker: { $ref: "#/components/schemas/ProgressTracker" },
          progress: { type: "number", minimum: 0, maximum: 1 },
          blockedByTaskIds: { $ref: "#/components/schemas/EntityIdArray" }
        },
        description: "All fields are optional. Omitted fields are unchanged. Use null for nullable fields to clear them."
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
      CreateAttachmentRequest: {
        type: "object",
        required: ["description", "url"],
        additionalProperties: false,
        properties: {
          description: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri", description: "Use file:// URLs for local files." },
          type: { type: "string", minLength: 1 }
        }
      },
      UpdateAttachmentRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri", description: "Use file:// URLs for local files." },
          type: { type: ["string", "null"], minLength: 1 }
        }
      },
      ReorderTaskAttachmentsRequest: {
        type: "object",
        required: ["attachmentIds"],
        additionalProperties: false,
        properties: { attachmentIds: { $ref: "#/components/schemas/EntityIdArray" } },
        description: "Must include exactly the attachment IDs already owned by the task, in the desired order."
      },
      AttachmentListResponse: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: attachmentRef } }
      },
      Comment: {
        type: "object",
        required: ["id", "taskId", "body", "position", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          taskId: { type: "string" },
          body: { type: "string" },
          position: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CreateCommentRequest: {
        type: "object",
        required: ["body"],
        additionalProperties: false,
        properties: { body: { type: "string", minLength: 1, description: "Markdown comment body." } }
      },
      UpdateCommentRequest: {
        type: "object",
        additionalProperties: false,
        properties: { body: { type: "string", minLength: 1, description: "Markdown comment body." } }
      },
      ReorderTaskCommentsRequest: {
        type: "object",
        required: ["commentIds"],
        additionalProperties: false,
        properties: { commentIds: { $ref: "#/components/schemas/EntityIdArray" } },
        description: "Must include exactly the comment IDs already owned by the task, in the desired order."
      },
      CommentListResponse: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: commentRef } }
      },
      TaskListResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: { type: "array", items: taskRef },
          nextCursor: { type: "string" }
        }
      },
      DateDeadline: {
        type: "object",
        required: ["kind", "date"],
        additionalProperties: false,
        properties: { kind: { const: "date" }, date: { type: "string", format: "date" } }
      },
      DateTimeDeadline: {
        type: "object",
        required: ["kind", "datetime"],
        additionalProperties: false,
        properties: { kind: { const: "datetime" }, datetime: { type: "string", format: "date-time", description: "UTC ISO 8601 with Z suffix." } }
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

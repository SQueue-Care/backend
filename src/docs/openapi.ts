const successResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          status: { type: "string", example: "success" },
          data: {},
          meta: { type: "object", additionalProperties: true },
        },
        required: ["status", "data"],
      },
    },
  },
});

const errorResponse = (description: string, statusCode: number) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          status: { type: "string", example: "error" },
          error: {
            type: "object",
            properties: {
              message: { type: "string", example: description },
              code: { type: "string", example: String(statusCode) },
              details: {},
            },
            required: ["message"],
          },
        },
        required: ["status", "error"],
      },
    },
  },
});

const idPathParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Healthcare Queue & CDSS API",
    version: "0.1.0",
    description: "Swagger documentation for all module routes under /api/v1.",
  },
  servers: [{ url: "/api/v1", description: "Main API" }],
  tags: [
    { name: "Auth" },
    { name: "Users" },
    { name: "Patients" },
    { name: "Doctors" },
    { name: "Departments" },
    { name: "Schedules" },
    { name: "Queues" },
    { name: "Appointments" },
    { name: "Predictions" },
    { name: "CDSS" },
    { name: "BPJS" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      RegisterBody: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1 },
          role: { type: "string", enum: ["PATIENT", "DOCTOR", "ADMIN"] },
        },
      },
      LoginBody: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 1 },
        },
      },
      RefreshBody: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string", minLength: 10 } },
      },
      UpdateUserBody: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          role: { type: "string", enum: ["PATIENT", "DOCTOR", "ADMIN"] },
          isActive: { type: "boolean" },
        },
      },
      CreatePatientBody: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1 },
          nik: { type: "string", minLength: 16, maxLength: 16 },
          bpjsNumber: { type: "string" },
          phone: { type: "string" },
          gender: { type: "string", enum: ["MALE", "FEMALE", "OTHER"] },
          birthDate: { type: "string", format: "date-time" },
          address: { type: "string" },
        },
      },
      UpdatePatientBody: {
        type: "object",
        properties: {
          nik: { type: "string", minLength: 16, maxLength: 16 },
          bpjsNumber: { type: "string" },
          phone: { type: "string" },
          gender: { type: "string", enum: ["MALE", "FEMALE", "OTHER"] },
          birthDate: { type: "string", format: "date-time" },
          address: { type: "string" },
        },
      },
      CreateDoctorBody: {
        type: "object",
        required: ["email", "password", "name", "specialization"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1 },
          specialization: { type: "string", minLength: 1 },
          licenseNumber: { type: "string" },
          departmentId: { type: "string" },
          avgServiceMin: { type: "integer", minimum: 1, maximum: 180, default: 10 },
        },
      },
      UpdateDoctorBody: {
        type: "object",
        properties: {
          specialization: { type: "string", minLength: 1 },
          licenseNumber: { type: "string" },
          departmentId: { type: "string", nullable: true },
          avgServiceMin: { type: "integer", minimum: 1, maximum: 180 },
        },
      },
      CreateDepartmentBody: {
        type: "object",
        required: ["code", "name"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 32 },
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
        },
      },
      UpdateDepartmentBody: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
        },
      },
      CreateScheduleBody: {
        type: "object",
        required: ["doctorId", "departmentId", "dayOfWeek", "startTime", "endTime"],
        properties: {
          doctorId: { type: "string" },
          departmentId: { type: "string" },
          dayOfWeek: {
            type: "string",
            enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
          },
          startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          capacity: { type: "integer", minimum: 1, maximum: 500, default: 30 },
          isActive: { type: "boolean", default: true },
        },
      },
      UpdateScheduleBody: {
        type: "object",
        properties: {
          dayOfWeek: {
            type: "string",
            enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
          },
          startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          capacity: { type: "integer", minimum: 1, maximum: 500 },
          isActive: { type: "boolean" },
        },
      },
      CreateQueueBody: {
        type: "object",
        required: ["departmentId"],
        properties: {
          patientId: { type: "string" },
          departmentId: { type: "string" },
          doctorId: { type: "string" },
          scheduleId: { type: "string" },
          notes: { type: "string", maxLength: 500 },
        },
      },
      UpdateQueueStatusBody: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["WAITING", "CALLED", "IN_PROGRESS", "DONE", "SKIPPED", "CANCELLED"],
          },
          notes: { type: "string", maxLength: 500 },
        },
      },
      CreateAppointmentBody: {
        type: "object",
        required: ["doctorId", "departmentId", "scheduledAt"],
        properties: {
          patientId: { type: "string" },
          doctorId: { type: "string" },
          departmentId: { type: "string" },
          scheduleId: { type: "string" },
          scheduledAt: { type: "string", format: "date-time" },
          notes: { type: "string", maxLength: 500 },
        },
      },
      UpdateAppointmentBody: {
        type: "object",
        properties: {
          scheduledAt: { type: "string", format: "date-time" },
          status: {
            type: "string",
            enum: ["BOOKED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
          },
          notes: { type: "string", maxLength: 500 },
        },
      },
      RecommendBody: {
        type: "object",
        properties: {
          gejala: { type: "string", minLength: 3, description: "Deskripsi gejala (Bahasa Indonesia)" },
          symptoms: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
            description: "Kode gejala dari master data",
          },
          patientId: { type: "string" },
          queueId: { type: "string" },
        },
      },
      AnalyzeNotesBody: {
        type: "object",
        required: ["notes"],
        properties: {
          notes: { type: "string", minLength: 3 },
          patientId: { type: "string" },
          queueId: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register account",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RegisterBody" } },
          },
        },
        responses: {
          "200": successResponse("Registered"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login account",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginBody" } } },
        },
        responses: {
          "200": successResponse("Login success"),
          "401": errorResponse("Unauthorized", 401),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshBody" } } },
        },
        responses: {
          "200": successResponse("Token refreshed"),
          "401": errorResponse("Invalid token", 401),
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout account",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshBody" } } },
        },
        responses: {
          "200": successResponse("Logout success"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": successResponse("Current user"),
          "401": errorResponse("Unauthorized", 401),
        },
      },
    },
    "/users": {
      get: {
        tags: ["Users"],
        summary: "List users (admin only)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: { "200": successResponse("Users list"), "403": errorResponse("Forbidden", 403) },
      },
    },
    "/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get user by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("User detail"),
          "404": errorResponse("User not found", 404),
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update user by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateUserBody" } },
          },
        },
        responses: {
          "200": successResponse("User updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("User not found", 404),
        },
      },
    },
    "/patients": {
      get: {
        tags: ["Patients"],
        summary: "List patients",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": successResponse("Patients list"),
          "403": errorResponse("Forbidden", 403),
        },
      },
      post: {
        tags: ["Patients"],
        summary: "Create patient",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreatePatientBody" } },
          },
        },
        responses: {
          "201": successResponse("Patient created"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/patients/{id}": {
      get: {
        tags: ["Patients"],
        summary: "Get patient by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Patient detail"),
          "404": errorResponse("Patient not found", 404),
        },
      },
      patch: {
        tags: ["Patients"],
        summary: "Update patient by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdatePatientBody" } },
          },
        },
        responses: {
          "200": successResponse("Patient updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Patients"],
        summary: "Delete patient by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("Patient not found", 404),
        },
      },
    },
    "/patients/{id}/queues": {
      get: {
        tags: ["Patients"],
        summary: "Get patient queues",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Patient queues"),
          "404": errorResponse("Patient not found", 404),
        },
      },
    },
    "/patients/{id}/appointments": {
      get: {
        tags: ["Patients"],
        summary: "Get patient appointments",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Patient appointments"),
          "404": errorResponse("Patient not found", 404),
        },
      },
    },
    "/doctors": {
      get: {
        tags: ["Doctors"],
        summary: "List doctors",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: { "200": successResponse("Doctors list") },
      },
      post: {
        tags: ["Doctors"],
        summary: "Create doctor",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateDoctorBody" } },
          },
        },
        responses: {
          "201": successResponse("Doctor created"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/doctors/{id}": {
      get: {
        tags: ["Doctors"],
        summary: "Get doctor by id",
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Doctor detail"),
          "404": errorResponse("Doctor not found", 404),
        },
      },
      patch: {
        tags: ["Doctors"],
        summary: "Update doctor by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateDoctorBody" } },
          },
        },
        responses: {
          "200": successResponse("Doctor updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Doctors"],
        summary: "Delete doctor by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("Doctor not found", 404),
        },
      },
    },
    "/doctors/{id}/schedules": {
      get: {
        tags: ["Doctors"],
        summary: "Get doctor schedules",
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Doctor schedules"),
          "404": errorResponse("Doctor not found", 404),
        },
      },
    },
    "/departments": {
      get: {
        tags: ["Departments"],
        summary: "List departments",
        responses: { "200": successResponse("Departments list") },
      },
      post: {
        tags: ["Departments"],
        summary: "Create department",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateDepartmentBody" } },
          },
        },
        responses: {
          "201": successResponse("Department created"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/departments/{id}": {
      get: {
        tags: ["Departments"],
        summary: "Get department by id",
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Department detail"),
          "404": errorResponse("Department not found", 404),
        },
      },
      patch: {
        tags: ["Departments"],
        summary: "Update department by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateDepartmentBody" } },
          },
        },
        responses: {
          "200": successResponse("Department updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Departments"],
        summary: "Delete department by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("Department not found", 404),
        },
      },
    },
    "/schedules": {
      get: {
        tags: ["Schedules"],
        summary: "List schedules",
        parameters: [
          { name: "doctorId", in: "query", schema: { type: "string" } },
          { name: "departmentId", in: "query", schema: { type: "string" } },
          {
            name: "dayOfWeek",
            in: "query",
            schema: {
              type: "string",
              enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
            },
          },
        ],
        responses: { "200": successResponse("Schedules list") },
      },
      post: {
        tags: ["Schedules"],
        summary: "Create schedule",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateScheduleBody" } },
          },
        },
        responses: {
          "201": successResponse("Schedule created"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/schedules/{id}": {
      get: {
        tags: ["Schedules"],
        summary: "Get schedule by id",
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Schedule detail"),
          "404": errorResponse("Schedule not found", 404),
        },
      },
      patch: {
        tags: ["Schedules"],
        summary: "Update schedule by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateScheduleBody" } },
          },
        },
        responses: {
          "200": successResponse("Schedule updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Schedules"],
        summary: "Delete schedule by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("Schedule not found", 404),
        },
      },
    },
    "/queues": {
      post: {
        tags: ["Queues"],
        summary: "Create queue ticket",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateQueueBody" } },
          },
        },
        responses: {
          "201": successResponse("Queue created"),
          "400": errorResponse("Validation error", 400),
        },
      },
      get: {
        tags: ["Queues"],
        summary: "List queues",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "departmentId", in: "query", schema: { type: "string" } },
          { name: "doctorId", in: "query", schema: { type: "string" } },
          { name: "patientId", in: "query", schema: { type: "string" } },
          { name: "date", in: "query", schema: { type: "string", format: "date-time" } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["WAITING", "CALLED", "IN_PROGRESS", "DONE", "SKIPPED", "CANCELLED"],
            },
          },
        ],
        responses: {
          "200": successResponse("Queues list"),
          "403": errorResponse("Forbidden", 403),
        },
      },
    },
    "/queues/stats/overview": {
      get: {
        tags: ["Queues"],
        summary: "Queue overview statistics",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "date", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": successResponse("Queue statistics"),
          "403": errorResponse("Forbidden", 403),
        },
      },
    },
    "/queues/{id}": {
      get: {
        tags: ["Queues"],
        summary: "Get queue by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Queue detail"),
          "404": errorResponse("Queue not found", 404),
        },
      },
    },
    "/queues/{id}/status": {
      patch: {
        tags: ["Queues"],
        summary: "Update queue status",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateQueueStatusBody" } },
          },
        },
        responses: {
          "200": successResponse("Queue updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/queues/{id}/cancel": {
      post: {
        tags: ["Queues"],
        summary: "Cancel queue",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Queue cancelled"),
          "404": errorResponse("Queue not found", 404),
        },
      },
    },
    "/appointments": {
      get: {
        tags: ["Appointments"],
        summary: "List appointments",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": successResponse("Appointments list"),
          "403": errorResponse("Forbidden", 403),
        },
      },
      post: {
        tags: ["Appointments"],
        summary: "Create appointment",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateAppointmentBody" } },
          },
        },
        responses: {
          "201": successResponse("Appointment created"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/appointments/{id}": {
      get: {
        tags: ["Appointments"],
        summary: "Get appointment by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "200": successResponse("Appointment detail"),
          "404": errorResponse("Appointment not found", 404),
        },
      },
      patch: {
        tags: ["Appointments"],
        summary: "Update appointment by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateAppointmentBody" } },
          },
        },
        responses: {
          "200": successResponse("Appointment updated"),
          "400": errorResponse("Validation error", 400),
        },
      },
      delete: {
        tags: ["Appointments"],
        summary: "Delete appointment by id",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParam],
        responses: {
          "204": { description: "Deleted" },
          "404": errorResponse("Appointment not found", 404),
        },
      },
    },
    "/predictions/wait-time": {
      get: {
        tags: ["Predictions"],
        summary: "Estimate waiting time",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "departmentId", in: "query", required: true, schema: { type: "string" } },
          { name: "scheduleId", in: "query", schema: { type: "string" } },
          { name: "doctorId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": successResponse("Wait time estimate"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
    "/cdss/symptoms": {
      get: {
        tags: ["CDSS"],
        summary: "List symptoms",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": successResponse("Symptoms list"),
          "401": errorResponse("Unauthorized", 401),
        },
      },
    },
    "/cdss/ai-status": {
      get: {
        tags: ["CDSS"],
        summary: "SmartQueue Gemini CDSS availability",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": successResponse("AI status"),
          "401": errorResponse("Unauthorized", 401),
          "403": errorResponse("Forbidden", 403),
        },
      },
    },
    "/cdss/recommend": {
      post: {
        tags: ["CDSS"],
        summary: "Generate diagnosis recommendation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RecommendBody" } },
          },
        },
        responses: {
          "200": successResponse("Recommendation result"),
          "403": errorResponse("Forbidden", 403),
          "503": errorResponse("AI service unavailable", 503),
        },
      },
    },
    "/cdss/analyze-notes": {
      post: {
        tags: ["CDSS"],
        summary: "Analyze clinical notes with AI",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AnalyzeNotesBody" } },
          },
        },
        responses: {
          "200": successResponse("Analysis result"),
          "403": errorResponse("Forbidden", 403),
          "503": errorResponse("AI service unavailable", 503),
        },
      },
    },
    "/cdss/history/{patientId}": {
      get: {
        tags: ["CDSS"],
        summary: "Get recommendation history by patient",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "patientId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": successResponse("Recommendation history"),
          "403": errorResponse("Forbidden", 403),
        },
      },
    },
    "/bpjs/verify/{nik}": {
      get: {
        tags: ["BPJS"],
        summary: "Verify BPJS by NIK",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "nik",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^\\d{16}$" },
          },
        ],
        responses: {
          "200": successResponse("BPJS verification result"),
          "400": errorResponse("Validation error", 400),
        },
      },
    },
  },
} as const;

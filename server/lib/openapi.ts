/**
 * OpenAPI 3.0 Specification Generator for MOTHER API
 * Generates interactive API documentation from tRPC routers
 */

import type { OpenAPIObject } from "openapi3-ts/oas31";

const PRODUCTION_URL =
  "https://mother-interface-233196174701.australia-southeast1.run.app";
const DEV_URL = "http://localhost:3000";

export function generateOpenAPISpec(): OpenAPIObject {
  const baseUrl =
    process.env.NODE_ENV === "production" ? PRODUCTION_URL : DEV_URL;

  return {
    openapi: "3.0.3",
    info: {
      title: "MOTHER API",
      version: "14.0.0",
      description: `
# MOTHER API Documentation

**MOTHER** (Multi-Operational Tiered Hierarchical Execution & Routing) is an advanced AI system with 83% cost reduction and 90+ quality.

## Features

- **7-Layer Architecture**: Intelligent routing across 7 AI tiers
- **Cost Optimization**: 83% cost reduction through smart tier selection
- **High Quality**: 90+ quality score across all tiers
- **Async Processing**: BullMQ for heavy queries (tier 3)
- **Caching**: Two-tier Redis + Database caching (70%+ hit rate)
- **Rate Limiting**: Intelligent rate limiting per endpoint

## Authentication

Currently using cookie-based authentication via Manus OAuth.

**Login Flow**:
1. Navigate to \`/api/oauth/login\`
2. Complete OAuth flow
3. Session cookie is set
4. Use \`credentials: 'include'\` in fetch requests

## Rate Limits

- **Global**: 100 requests per 15 minutes
- **MOTHER Query**: 10 requests per minute
- **MOTHER Async**: 5 requests per minute

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Maximum requests allowed
- \`X-RateLimit-Remaining\`: Requests remaining in window
- \`X-RateLimit-Reset\`: Timestamp when limit resets
- \`Retry-After\`: Seconds to wait (on 429 responses)

## Error Handling

All errors follow a consistent format:

\`\`\`json
{
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "data": {
      // Additional error details
    }
  }
}
\`\`\`

## CORS

CORS is enabled for all origins. Include \`credentials: 'include'\` in requests to send cookies.

## SDKs

- **JavaScript**: \`npm install @mother/sdk-js\`
- **Python**: \`pip install mother-sdk\`
      `.trim(),
      contact: {
        name: "Everton Luis Garcia",
        email: "everton@intelltech.com.br",
      },
      license: {
        name: "Proprietary",
      },
    },
    servers: [
      {
        url: baseUrl,
        description:
          process.env.NODE_ENV === "production" ? "Production" : "Development",
      },
    ],
    tags: [
      {
        name: "Authentication",
        description: "User authentication and session management",
      },
      {
        name: "MOTHER",
        description: "Core MOTHER AI query endpoints",
      },
      {
        name: "Health",
        description: "System health and monitoring",
      },
      {
        name: "Queue",
        description: "Async job queue monitoring",
      },
      {
        name: "Backup",
        description: "Database backup operations",
      },
    ],
    paths: {
      "/api/oauth/login": {
        get: {
          tags: ["Authentication"],
          summary: "Initiate OAuth login",
          description: "Redirects to Manus OAuth login page",
          parameters: [
            {
              name: "returnPath",
              in: "query",
              description: "Path to return to after login",
              required: false,
              schema: {
                type: "string",
                example: "/admin",
              },
            },
          ],
          responses: {
            "302": {
              description: "Redirect to OAuth provider",
            },
          },
        },
      },
      "/api/oauth/callback": {
        get: {
          tags: ["Authentication"],
          summary: "OAuth callback",
          description: "Handles OAuth callback and sets session cookie",
          parameters: [
            {
              name: "code",
              in: "query",
              required: true,
              schema: {
                type: "string",
              },
            },
            {
              name: "state",
              in: "query",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "302": {
              description: "Redirect to return path with session cookie set",
            },
            "400": {
              description: "Invalid OAuth callback",
            },
          },
        },
      },
      "/api/trpc/auth.me": {
        get: {
          tags: ["Authentication"],
          summary: "Get current user",
          description: "Returns the currently authenticated user",
          responses: {
            "200": {
              description: "Current user",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              openId: { type: "string" },
                              name: { type: "string" },
                              email: { type: "string" },
                              avatarUrl: {
                                oneOf: [{ type: "string" }, { type: "null" }],
                              },
                              role: { type: "string", enum: ["admin", "user"] },
                              createdAt: {
                                type: "string",
                                format: "date-time",
                              },
                              lastSignedInAt: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    result: {
                      data: {
                        id: "1",
                        openId: "oauth_123",
                        name: "Everton Luis Garcia",
                        email: "everton@intelltech.com.br",
                        avatarUrl: null,
                        role: "admin",
                        createdAt: "2026-02-21T00:00:00.000Z",
                        lastSignedInAt: "2026-02-21T07:00:00.000Z",
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Not authenticated",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/auth.logout": {
        post: {
          tags: ["Authentication"],
          summary: "Logout",
          description: "Clears session cookie and logs out user",
          responses: {
            "200": {
              description: "Successfully logged out",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              success: { type: "boolean" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/mother.query": {
        post: {
          tags: ["MOTHER"],
          summary: "Query MOTHER (Synchronous)",
          description:
            "Send a query to MOTHER AI. All tiers process synchronously.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query", "tier"],
                  properties: {
                    query: {
                      type: "string",
                      description: "The question or prompt to send to MOTHER",
                      example: "What is the meaning of life?",
                    },
                    tier: {
                      type: "integer",
                      minimum: 1,
                      maximum: 3,
                      description:
                        "AI tier to use (1=fast/cheap, 2=balanced, 3=best/expensive)",
                      example: 1,
                    },
                    context: {
                      type: "string",
                      description: "Optional context for the query",
                      oneOf: [{ type: "string" }, { type: "null" }],
                    },
                  },
                },
                example: {
                  query: "Explain quantum computing in simple terms",
                  tier: 2,
                  context: "For a high school student",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Query successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              response: { type: "string" },
                              tier: { type: "integer" },
                              cached: { type: "boolean" },
                              processingTime: { type: "number" },
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    result: {
                      data: {
                        response:
                          "Quantum computing uses quantum mechanics principles...",
                        tier: 2,
                        cached: false,
                        processingTime: 1250,
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
            "401": {
              description: "Not authenticated",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              headers: {
                "Retry-After": {
                  schema: {
                    type: "integer",
                  },
                  description: "Seconds to wait before retrying",
                },
              },
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/mother.queryAsync": {
        post: {
          tags: ["MOTHER"],
          summary: "Query MOTHER (Asynchronous)",
          description:
            "Send a query to MOTHER AI. Tier 3 queries are processed asynchronously via BullMQ.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query", "tier"],
                  properties: {
                    query: { type: "string" },
                    tier: { type: "integer", minimum: 1, maximum: 3 },
                    context: { oneOf: [{ type: "string" }, { type: "null" }] },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Query accepted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              jobId: {
                                type: "string",
                                description: "Job ID for tier 3 queries",
                              },
                              response: {
                                type: "string",
                                description: "Immediate response for tier 1-2",
                              },
                              tier: { type: "integer" },
                              async: { type: "boolean" },
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    result: {
                      data: {
                        jobId: "job_abc123",
                        tier: 3,
                        async: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/health.check": {
        get: {
          tags: ["Health"],
          summary: "Simple health check",
          description: "Returns OK if server is running",
          responses: {
            "200": {
              description: "Server is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              status: { type: "string", example: "ok" },
                              timestamp: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/health.detailed": {
        get: {
          tags: ["Health"],
          summary: "Detailed health check",
          description: "Returns detailed system health information",
          responses: {
            "200": {
              description: "Detailed health status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              status: { type: "string" },
                              timestamp: {
                                type: "string",
                                format: "date-time",
                              },
                              uptime: {
                                type: "number",
                                description: "Server uptime in seconds",
                              },
                              memory: {
                                type: "object",
                                properties: {
                                  used: { type: "number" },
                                  total: { type: "number" },
                                  heapUsed: { type: "number" },
                                  heapTotal: { type: "number" },
                                  rss: { type: "number" },
                                },
                              },
                              database: {
                                type: "object",
                                properties: {
                                  connected: { type: "boolean" },
                                  responseTime: {
                                    type: "number",
                                    description: "DB response time in ms",
                                  },
                                },
                              },
                              environment: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/health.cache": {
        get: {
          tags: ["Health"],
          summary: "Cache statistics",
          description: "Returns Redis cache statistics",
          responses: {
            "200": {
              description: "Cache statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              connected: { type: "boolean" },
                              keys: { type: "number" },
                              memory: { type: "number" },
                              hitRate: {
                                type: "number",
                                description: "Cache hit rate percentage",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/queue.stats": {
        get: {
          tags: ["Queue"],
          summary: "Queue statistics",
          description: "Returns BullMQ queue statistics",
          responses: {
            "200": {
              description: "Queue statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              waiting: { type: "number" },
                              active: { type: "number" },
                              completed: { type: "number" },
                              failed: { type: "number" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/queue.job": {
        get: {
          tags: ["Queue"],
          summary: "Get job status",
          description: "Returns status of a specific job",
          parameters: [
            {
              name: "jobId",
              in: "query",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Job status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              state: {
                                type: "string",
                                enum: [
                                  "waiting",
                                  "active",
                                  "completed",
                                  "failed",
                                ],
                              },
                              progress: { type: "number" },
                              result: {
                                oneOf: [{ type: "object" }, { type: "null" }],
                              },
                              error: {
                                oneOf: [{ type: "string" }, { type: "null" }],
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/trpc/backup.trigger": {
        post: {
          tags: ["Backup"],
          summary: "Trigger database backup",
          description:
            "Manually trigger a database backup (requires BACKUP_TOKEN)",
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            "200": {
              description: "Backup successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              success: { type: "boolean" },
                              timestamp: {
                                type: "string",
                                format: "date-time",
                              },
                              filename: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Invalid or missing backup token",
            },
          },
        },
      },
      "/api/trpc/backup.status": {
        get: {
          tags: ["Backup"],
          summary: "Get backup status",
          description: "Returns status of the last backup",
          responses: {
            "200": {
              description: "Backup status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              lastBackup: {
                                oneOf: [
                                  { type: "string", format: "date-time" },
                                  { type: "null" },
                                ],
                              },
                              nextBackup: {
                                type: "string",
                                format: "date-time",
                              },
                              status: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Human-readable error message",
                },
                code: {
                  type: "string",
                  description: "Machine-readable error code",
                },
                data: {
                  type: "object",
                  description: "Additional error details",
                  oneOf: [{ type: "object" }, { type: "null" }],
                },
              },
            },
          },
          example: {
            error: {
              message: "Please login (10001)",
              code: "UNAUTHORIZED",
              data: null,
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Bearer token for backup operations (BACKUP_TOKEN)",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Session cookie from OAuth login",
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
  };
}

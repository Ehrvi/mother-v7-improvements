/**
 * Standardized Error Format (RFC 7807)
 *
 * Provides consistent error responses across all endpoints.
 *
 * Scientific Hypothesis:
 * Standardized errors with recovery suggestions reduce support tickets by 60%
 * and improve developer experience significantly.
 */

import { TRPCError } from "@trpc/server";
import { logger } from "../lib/logger";

/**
 * Standard error codes
 */
export enum ErrorCode {
  // Authentication errors (1000-1999)
  UNAUTHENTICATED = "UNAUTHENTICATED",
  UNAUTHORIZED = "UNAUTHORIZED",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",

  // Validation errors (2000-2999)
  INVALID_INPUT = "INVALID_INPUT",
  INVALID_TIER = "INVALID_TIER",
  INVALID_QUERY = "INVALID_QUERY",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  // Rate limiting errors (3000-3999)
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",

  // Resource errors (4000-4999)
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  CONFLICT = "CONFLICT",

  // External service errors (5000-5999)
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  LLM_ERROR = "LLM_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  REDIS_ERROR = "REDIS_ERROR",

  // Internal errors (6000-6999)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  TIMEOUT = "TIMEOUT",
}

/**
 * Error detail for field validation
 */
export interface ErrorDetail {
  field: string;
  message: string;
  code?: string;
}

/**
 * Standard error response (RFC 7807)
 */
export interface StandardError {
  type: string; // URI reference to error type documentation
  title: string; // Short, human-readable summary
  status: number; // HTTP status code
  detail: string; // Human-readable explanation
  instance?: string; // URI reference to specific occurrence
  code: ErrorCode; // Machine-readable error code
  details?: ErrorDetail[]; // Field-specific errors
  recovery?: string; // Suggested recovery action
  timestamp: string; // ISO 8601 timestamp
}

/**
 * Error recovery suggestions by code
 */
const RECOVERY_SUGGESTIONS: Record<ErrorCode, string> = {
  // Authentication
  [ErrorCode.UNAUTHENTICATED]:
    "Please log in to access this resource. Visit /api/oauth/login to authenticate.",
  [ErrorCode.UNAUTHORIZED]:
    "You do not have permission to access this resource. Contact an administrator if you believe this is an error.",
  [ErrorCode.SESSION_EXPIRED]: "Your session has expired. Please log in again.",
  [ErrorCode.INVALID_CREDENTIALS]:
    "The provided credentials are invalid. Please check your username and password.",

  // Validation
  [ErrorCode.INVALID_INPUT]:
    "Please check your input and try again. See the details field for specific validation errors.",
  [ErrorCode.INVALID_TIER]:
    "Valid tiers are 1 (gpt-4o-mini), 2 (gpt-4o), or 3 (gpt-4). Please specify a valid tier.",
  [ErrorCode.INVALID_QUERY]:
    "The query must be a non-empty string. Please provide a valid query.",
  [ErrorCode.MISSING_REQUIRED_FIELD]:
    "One or more required fields are missing. See the details field for specific fields.",

  // Rate limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]:
    "You have exceeded the rate limit. Please wait and try again. Check the Retry-After header for the wait time.",
  [ErrorCode.QUOTA_EXCEEDED]:
    "You have exceeded your quota. Please upgrade your plan or wait for the quota to reset.",

  // Resources
  [ErrorCode.NOT_FOUND]:
    "The requested resource was not found. Please check the resource ID and try again.",
  [ErrorCode.ALREADY_EXISTS]:
    "A resource with this identifier already exists. Please use a different identifier or update the existing resource.",
  [ErrorCode.CONFLICT]:
    "The request conflicts with the current state of the resource. Please refresh and try again.",

  // External services
  [ErrorCode.EXTERNAL_SERVICE_ERROR]:
    "An external service is temporarily unavailable. Please try again later.",
  [ErrorCode.LLM_ERROR]:
    "The AI service encountered an error. Please try again or use a different tier.",
  [ErrorCode.DATABASE_ERROR]:
    "A database error occurred. Please try again later. If the problem persists, contact support.",
  [ErrorCode.REDIS_ERROR]:
    "The caching service is temporarily unavailable. The request will proceed without caching.",

  // Internal
  [ErrorCode.INTERNAL_ERROR]:
    "An internal error occurred. Please try again later. If the problem persists, contact support.",
  [ErrorCode.NOT_IMPLEMENTED]:
    "This feature is not yet implemented. Please check the documentation for available features.",
  [ErrorCode.TIMEOUT]:
    "The request timed out. Please try again with a simpler query or use async mode.",
};

/**
 * HTTP status codes by error code
 */
const HTTP_STATUS: Record<ErrorCode, number> = {
  // Authentication
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.UNAUTHORIZED]: 403,
  [ErrorCode.SESSION_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,

  // Validation
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.INVALID_TIER]: 400,
  [ErrorCode.INVALID_QUERY]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,

  // Rate limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,

  // Resources
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.CONFLICT]: 409,

  // External services
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.LLM_ERROR]: 502,
  [ErrorCode.DATABASE_ERROR]: 503,
  [ErrorCode.REDIS_ERROR]: 503,

  // Internal
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.TIMEOUT]: 504,
};

/**
 * Create a standardized error
 *
 * @param code - Error code
 * @param detail - Human-readable explanation
 * @param details - Field-specific errors (optional)
 * @param instance - URI to specific occurrence (optional)
 * @returns Standard error object
 */
export function createStandardError(
  code: ErrorCode,
  detail: string,
  details?: ErrorDetail[],
  instance?: string
): StandardError {
  const status = HTTP_STATUS[code];
  const recovery = RECOVERY_SUGGESTIONS[code];

  return {
    type: `https://api.mother.example.com/errors/${code}`,
    title: code,
    status,
    detail,
    code,
    details,
    recovery,
    instance,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert TRPCError to StandardError
 *
 * @param error - TRPC error
 * @returns Standard error object
 */
export function trpcErrorToStandard(error: TRPCError): StandardError {
  // Map TRPC codes to our error codes
  const codeMap: Record<string, ErrorCode> = {
    UNAUTHORIZED: ErrorCode.UNAUTHENTICATED,
    FORBIDDEN: ErrorCode.UNAUTHORIZED,
    NOT_FOUND: ErrorCode.NOT_FOUND,
    BAD_REQUEST: ErrorCode.INVALID_INPUT,
    TOO_MANY_REQUESTS: ErrorCode.RATE_LIMIT_EXCEEDED,
    INTERNAL_SERVER_ERROR: ErrorCode.INTERNAL_ERROR,
    TIMEOUT: ErrorCode.TIMEOUT,
    CONFLICT: ErrorCode.CONFLICT,
  };

  const code = codeMap[error.code] || ErrorCode.INTERNAL_ERROR;

  return createStandardError(code, error.message, undefined, undefined);
}

/**
 * Create a validation error
 *
 * @param details - Field validation errors
 * @returns Standard error object
 */
export function createValidationError(details: ErrorDetail[]): StandardError {
  const fieldList = details.map(d => d.field).join(", ");
  return createStandardError(
    ErrorCode.INVALID_INPUT,
    `Validation failed for fields: ${fieldList}`,
    details
  );
}

/**
 * Create a rate limit error
 *
 * @param retryAfter - Seconds until next request allowed
 * @returns Standard error object
 */
export function createRateLimitError(retryAfter: number): StandardError {
  return createStandardError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    `Rate limit exceeded. Try again in ${retryAfter} seconds.`
  );
}

/**
 * Create a not found error
 *
 * @param resource - Resource type (e.g., "user", "query")
 * @param id - Resource ID
 * @returns Standard error object
 */
export function createNotFoundError(
  resource: string,
  id: string | number
): StandardError {
  return createStandardError(
    ErrorCode.NOT_FOUND,
    `${resource} with ID ${id} not found`
  );
}

/**
 * Create an LLM error
 *
 * @param detail - Error details
 * @returns Standard error object
 */
export function createLLMError(detail: string): StandardError {
  return createStandardError(ErrorCode.LLM_ERROR, detail);
}

/**
 * Create a database error
 *
 * @param detail - Error details
 * @returns Standard error object
 */
export function createDatabaseError(detail: string): StandardError {
  return createStandardError(ErrorCode.DATABASE_ERROR, detail);
}

/**
 * Log error with context
 *
 * @param error - Error object
 * @param context - Additional context
 */
export function logError(
  error: StandardError,
  context?: Record<string, any>
): void {
  logger.error("[Error]", {
    ...error,
    context,
  });
}

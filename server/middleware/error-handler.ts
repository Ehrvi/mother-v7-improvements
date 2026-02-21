import { Request, Response, NextFunction } from "express";
import { logError } from "../lib/logger";
import { TRPCError } from "@trpc/server";

// Global error handler middleware
export const errorHandler = (
  err: Error | TRPCError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error
  logError("Unhandled error", err);

  // Determine status code
  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof TRPCError) {
    switch (err.code) {
      case "BAD_REQUEST":
        statusCode = 400;
        message = err.message;
        break;
      case "UNAUTHORIZED":
        statusCode = 401;
        message = "Unauthorized";
        break;
      case "FORBIDDEN":
        statusCode = 403;
        message = "Forbidden";
        break;
      case "NOT_FOUND":
        statusCode = 404;
        message = "Not Found";
        break;
      case "TIMEOUT":
        statusCode = 408;
        message = "Request Timeout";
        break;
      case "CONFLICT":
        statusCode = 409;
        message = "Conflict";
        break;
      case "PRECONDITION_FAILED":
        statusCode = 412;
        message = "Precondition Failed";
        break;
      case "PAYLOAD_TOO_LARGE":
        statusCode = 413;
        message = "Payload Too Large";
        break;
      case "TOO_MANY_REQUESTS":
        statusCode = 429;
        message = "Too Many Requests";
        break;
      case "CLIENT_CLOSED_REQUEST":
        statusCode = 499;
        message = "Client Closed Request";
        break;
      default:
        statusCode = 500;
        message = "Internal Server Error";
    }
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
        details: err.message,
      }),
    },
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: "Route not found",
      path: req.path,
    },
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

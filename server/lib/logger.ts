import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

// Log levels: error, warn, info, http, verbose, debug, silly
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console output
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
};

winston.addColors(colors);

// Google Cloud Logging requires 'severity' field (uppercase) instead of 'level'
const severityMap: { [key: string]: string } = {
  error: 'ERROR',
  warn: 'WARNING',
  info: 'INFO',
  http: 'INFO',
  debug: 'DEBUG',
};

// Production format: JSON with Google Cloud Logging schema
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  // MUST transform before json() to ensure severity is included in final output
  winston.format((info) => {
    // Map Winston 'level' to Google Cloud 'severity'
    info.severity = severityMap[info.level] || 'INFO';
    // Keep level for Winston internal use, severity for Cloud Logging
    
    // Extract trace context from metadata if available
    if (info.traceId) {
      info['logging.googleapis.com/trace'] = `projects/mothers-library-mcp/traces/${info.traceId}`;
    }
    if (info.spanId) {
      info['logging.googleapis.com/spanId'] = info.spanId;
    }
    
    return info;
  })(),
  winston.format.json()
);

// Development format: colorized text for readability
const developmentFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    info =>
      `${info.timestamp} ${info.level}: ${info.message}${info.stack ? "\n" + info.stack : ""}`
  )
);

// File format: JSON for structured storage
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Transports
// Choose format based on environment
const isProduction = process.env.NODE_ENV === 'production';
const consoleFormat = isProduction ? productionFormat : developmentFormat;

const transports: winston.transport[] = [
  // Console output (production: JSON, development: colorized text)
  new winston.transports.Console({
    format: consoleFormat,
    level: isProduction ? "info" : "debug",
  }),

  // Daily rotate file - All logs
  new DailyRotateFile({
    filename: path.join(process.cwd(), "logs", "application-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d", // Keep logs for 14 days
    format: fileFormat,
    level: "info",
  }),

  // Daily rotate file - Error logs only
  new DailyRotateFile({
    filename: path.join(process.cwd(), "logs", "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "30d", // Keep error logs for 30 days
    format: fileFormat,
    level: "error",
  }),
];

// Create logger instance
export const logger = winston.createLogger({
  levels,
  format: fileFormat,
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(process.cwd(), "logs", "exceptions-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(process.cwd(), "logs", "rejections-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
    }),
  ],
});

// Helper functions
export const logInfo = (message: string, meta?: any) =>
  logger.info(message, meta);
export const logError = (message: string, error?: Error | any) => {
  if (error instanceof Error) {
    logger.error(message, { error: error.message, stack: error.stack });
  } else {
    logger.error(message, { error });
  }
};
export const logWarn = (message: string, meta?: any) =>
  logger.warn(message, meta);
export const logDebug = (message: string, meta?: any) =>
  logger.debug(message, meta);
export const logHttp = (message: string, meta?: any) =>
  logger.http(message, meta);

// HTTP request logging middleware
export const httpLogger = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logHttp(`${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
};

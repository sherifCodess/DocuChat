import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

// A client may send its own correlation id, but it ends up in every log line and in a response header,
// so only short plain identifiers are accepted. Anything else is replaced with a generated id.
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate a unique correlation ID for this request
  const supplied = req.headers["x-correlation-id"];
  const correlationId =
    typeof supplied === "string" && SAFE_CORRELATION_ID.test(supplied)
      ? supplied
      : randomUUID();

  // Attach to the request so other code can use it
  req.correlationId = correlationId;

  // Add it to the response headers so the client can reference it
  res.setHeader("X-Correlation-Id", correlationId);

  const startTime = Date.now();

  // Log the incoming request
  logger.http("Request received", {
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Log the response when it finishes
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    const logData = {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error("Request failed", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Request client error", logData);
    } else {
      logger.info("Request completed", logData);
    }
  });

  next();
}

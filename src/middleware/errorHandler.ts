import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

// Client errors raised by the body parser (not by our code).
const bodyParserErrors: Record<
  string,
  { status: number; code: string; message: string }
> = {
  "entity.parse.failed": {
    status: 400,
    code: "BAD_REQUEST",
    message: "Malformed JSON in request body",
  },
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "Request body too large",
  },
};

// Four parameters: Express identifies error-handling middleware by this signature.
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Operational error: we created this intentionally. Expected, so warn level.
  if (err instanceof AppError && err.isOperational) {
    logger.warn({
      event: "error:operational",
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Body parser error: the client sent something we can't read. Their mistake, warn level.
  const parserError = bodyParserErrors[(err as any).type];
  if (parserError) {
    logger.warn({
      event: "error:body_parser",
      type: (err as any).type,
      status: parserError.status,
    });
    return res.status(parserError.status).json({
      success: false,
      error: { code: parserError.code, message: parserError.message },
    });
  }

  // Programming error: this is a bug. Full stack goes to the logs, never to the client.
  logger.error({ event: "error:unhandled", err });
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}

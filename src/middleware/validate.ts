import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

export function validate(schema: z.ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.slice(1).join("."), // Remove 'body'/'query' prefix
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: errors,
        },
      });
    }

    // Replace req properties with validated (and transformed) data
    req.body = result.data.body ?? req.body;
    Object.defineProperty(req, "query", {
      value: result.data.query ?? req.query,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    req.params = result.data.params ?? req.params;

    next();
  };
}

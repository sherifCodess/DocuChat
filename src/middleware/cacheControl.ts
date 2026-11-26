import type { Request, Response, NextFunction } from "express";

export function privateNoCache(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "private, no-cache");
  next();
}

export function noStore(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

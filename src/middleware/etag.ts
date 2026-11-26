import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function etag(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    const serialized = JSON.stringify(body);
    const digest = createHash("sha1").update(serialized).digest("base64");
    const tag = `"${digest}"`;

    res.setHeader("ETag", tag);

    const ifNoneMatch = res.req.headers["if-none-match"];
    const matches =
      typeof ifNoneMatch === "string" &&
      ifNoneMatch.split(",").some((candidate) => {
        const value = candidate.trim();
        if (value === "*") return true;
        return value.replace(/^W\//, "") === tag;
      });

    if (matches) {
      return res.status(304).end();
    }

    return originalJson(body);
  }) as Response["json"];

  next();
}

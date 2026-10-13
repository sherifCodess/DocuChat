import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

function unauthorized(res: Response, message: string) {
  return res.status(401).json({
    success: false,
    error: { code: "UNAUTHORIZED", message },
  });
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return unauthorized(res, "No token provided");
  }

  const token = header.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);

    // Make sure it's an access token, not a refresh token
    if (payload.type !== "access") {
      return unauthorized(res, "Invalid token type");
    }

    // Attach user context to the request
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return unauthorized(res, "Token expired");
    }
    return unauthorized(res, "Invalid token");
  }
}

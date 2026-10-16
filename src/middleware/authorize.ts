import { Request, Response, NextFunction } from "express";
import { getUserPermissions } from "../services/user.service";
import { ForbiddenError } from "../lib/errors";

export function requirePermission(...requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError("Not authenticated");
      }

      const userPermissions = await getUserPermissions(req.user.id);

      // The user must have ALL required permissions
      const missing = requiredPermissions.filter(
        (p) => !userPermissions.has(p),
      );

      if (missing.length > 0) {
        throw new ForbiddenError("You do not have the required permission.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

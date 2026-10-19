import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  assignRoleSchema,
  revokeRoleSchema,
} from "../validators/admin.validator";
import { prisma } from "../lib/prisma";
import { appEvents } from "../lib/events";
import { AppError, NotFoundError } from "../lib/errors";

const router = Router();
router.use(authenticate);
router.use(requirePermission("roles:manage"));

/**
 * @swagger
 * /admin/roles:
 *   get:
 *     summary: List all roles with their permissions and user counts
 *     description: Requires the roles:manage permission.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the roles:manage permission
 */
router.get("/roles", async (req, res) => {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });

  res.json({
    success: true,
    data: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isDefault: role.isDefault,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => rp.permission.name),
    })),
  });
});

/**
 * @swagger
 * /admin/users/{userId}/roles:
 *   post:
 *     summary: Assign a role to a user
 *     description: Requires the roles:manage permission. Assigning a role the user already has is harmless.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleName]
 *             properties:
 *               roleName:
 *                 type: string
 *                 example: viewer
 *     responses:
 *       200:
 *         description: Role assigned
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the roles:manage permission
 *       404:
 *         description: User or role not found
 */
router.post(
  "/users/:userId/roles",
  validate(assignRoleSchema),
  async (req, res, next) => {
    try {
      const userId = req.params.userId as string;
      const { roleName } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new NotFoundError(`Role '${roleName}' not found`);

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: {
          userId,
          roleId: role.id,
          assignedBy: req.user!.id,
        },
      });

      // Audit event
      appEvents.emit("admin:role-assigned", {
        targetUserId: userId,
        roleName,
        assignedBy: req.user!.id,
      });

      res.json({
        success: true,
        data: { message: `Role '${roleName}' assigned to user` },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /admin/users/{userId}/roles/{roleName}:
 *   delete:
 *     summary: Revoke a role from a user
 *     description: Requires the roles:manage permission. The last remaining admin cannot lose the admin role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role revoked
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the roles:manage permission
 *       404:
 *         description: Role not found
 *       422:
 *         description: Refused because this is the last remaining admin
 */
router.delete(
  "/users/:userId/roles/:roleName",
  validate(revokeRoleSchema),
  async (req, res, next) => {
    try {
      const userId = req.params.userId as string;
      const roleName = req.params.roleName as string;

      const role = await prisma.role.findUnique({
        where: { name: roleName },
      });
      if (!role) throw new NotFoundError("Role not found");

      if (role.name === "admin") {
        // One statement, so two simultaneous revocations cannot both remove the last admin.
        const removed = await prisma.$executeRaw`
          DELETE FROM "UserRole"
          WHERE "userId" = ${userId} AND "roleId" = ${role.id}
            AND (SELECT COUNT(*) FROM "UserRole" WHERE "roleId" = ${role.id}) > 1`;
        if (removed === 0) {
          const holdsRole = await prisma.userRole.findUnique({
            where: { userId_roleId: { userId, roleId: role.id } },
          });
          if (holdsRole) {
            throw new AppError(
              "Cannot revoke the last remaining admin",
              422,
              "UNPROCESSABLE_ENTITY",
            );
          }
        }
      } else {
        await prisma.userRole.deleteMany({
          where: { userId, roleId: role.id },
        });
      }

      appEvents.emit("admin:role-revoked", {
        targetUserId: userId,
        roleName,
        revokedBy: req.user!.id,
      });

      res.json({
        success: true,
        data: { message: `Role '${roleName}' revoked` },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

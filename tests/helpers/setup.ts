import { prisma } from "../../src/lib/prisma";
import { seedRBAC } from "../../prisma/rbac-seed";

let rbacReady = false;

// Roles and permissions are reference data: seeded once per test file and never deleted.
export async function ensureRbac() {
  if (!rbacReady) {
    await seedRBAC();
    rbacReady = true;
  }
}

export async function resetDatabase() {
  await ensureRbac();
  // Delete in an order that respects foreign key constraints
  await prisma.message.deleteMany();
  await prisma.usageLog.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.document.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

// roleName: "member" by default, or null for a user with no role at all.
export async function createTestUser(
  overrides = {},
  roleName: string | null = "member",
) {
  await ensureRbac();
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("TestPassword1!", 4); // Low rounds for speed
  const user = await prisma.user.create({
    data: {
      email: "test@docuchat.dev",
      passwordHash: hash,
      ...overrides,
    },
  });
  if (roleName) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return user;
}

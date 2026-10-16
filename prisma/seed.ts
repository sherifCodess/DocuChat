import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { registerSchema } from "../src/validators/auth.validator";
import { seedRBAC } from "./rbac-seed";

// The admin user's credentials come from the environment, never from the repository.
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.");
  }

  // Same rules as registration, so the admin password meets the app's password policy.
  const parsed = registerSchema.safeParse({ body: { email, password } });
  if (!parsed.success) {
    throw new Error(
      "ADMIN_EMAIL or ADMIN_PASSWORD is invalid: " +
        parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });

  // An existing admin keeps their current password; it is only set on creation.
  const user = await prisma.user.upsert({
    where: { email: parsed.data.body.email },
    update: {},
    create: {
      name: "Admin",
      email: parsed.data.body.email,
      passwordHash: await hashPassword(password),
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  console.log(`Admin user ready: ${user.email}`);
}

async function main() {
  await seedRBAC();
  console.log("RBAC seeded: 3 roles, 9 permissions");
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

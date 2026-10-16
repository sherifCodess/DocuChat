import { prisma } from "../src/lib/prisma";

// Roles and permissions: shared by the seed script and the test setup.
export async function seedRBAC() {
  // Define permissions
  const permissionDefs = [
    { name: "documents:create", resource: "documents", action: "create", description: "Upload documents" },
    { name: "documents:read", resource: "documents", action: "read", description: "View documents" },
    { name: "documents:update", resource: "documents", action: "update", description: "Edit document metadata" },
    { name: "documents:delete", resource: "documents", action: "delete", description: "Delete documents" },
    { name: "conversations:create", resource: "conversations", action: "create", description: "Start conversations" },
    { name: "conversations:read", resource: "conversations", action: "read", description: "View conversations" },
    { name: "users:read", resource: "users", action: "read", description: "View user list" },
    { name: "users:manage", resource: "users", action: "manage", description: "Manage user accounts" },
    { name: "roles:manage", resource: "roles", action: "manage", description: "Manage roles and permissions" },
  ];

  // Upsert all permissions
  const permissions: Record<string, { id: string }> = {};
  for (const perm of permissionDefs) {
    permissions[perm.name] = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  // Define roles with their permissions
  const roleDefs = [
    {
      name: "admin",
      description: "Full system access",
      isDefault: false,
      permissions: Object.keys(permissions), // All permissions
    },
    {
      name: "member",
      description: "Standard user",
      isDefault: true,
      permissions: [
        "documents:create",
        "documents:read",
        "documents:update",
        "conversations:create",
        "conversations:read",
      ],
    },
    {
      name: "viewer",
      description: "Read-only access",
      isDefault: false,
      permissions: ["documents:read", "conversations:read"],
    },
  ];

  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {},
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isDefault: roleDef.isDefault,
      },
    });

    // Link permissions to role
    for (const permName of roleDef.permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permissions[permName].id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permissions[permName].id,
        },
      });
    }
  }
}

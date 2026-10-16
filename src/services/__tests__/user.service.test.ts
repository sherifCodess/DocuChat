import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserPermissions } from "../user.service";
import { prisma } from "../../lib/prisma";

vi.mock("../../lib/prisma", () => ({
  prisma: { userRole: { findMany: vi.fn() } },
}));

const role = (...names: string[]) => ({
  role: { permissions: names.map((name) => ({ permission: { name } })) },
});

describe("getUserPermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flattens the permissions of a role into a set", async () => {
    (prisma.userRole.findMany as any).mockResolvedValue([
      role("documents:read", "documents:create"),
    ]);
    const result = await getUserPermissions("user-1");
    expect(result).toEqual(new Set(["documents:read", "documents:create"]));
  });

  it("merges several roles and removes duplicates", async () => {
    (prisma.userRole.findMany as any).mockResolvedValue([
      role("documents:read", "conversations:read"),
      role("documents:read", "documents:delete"),
    ]);
    const result = await getUserPermissions("user-1");
    expect(result).toEqual(
      new Set(["documents:read", "conversations:read", "documents:delete"]),
    );
  });

  it("returns an empty set for a user with no roles", async () => {
    (prisma.userRole.findMany as any).mockResolvedValue([]);
    const result = await getUserPermissions("user-1");
    expect(result.size).toBe(0);
  });
});

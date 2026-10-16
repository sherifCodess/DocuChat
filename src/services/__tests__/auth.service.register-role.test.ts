import { describe, it, expect, vi, beforeEach } from "vitest";
import * as authService from "../auth.service";
import { prisma } from "../../lib/prisma";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    role: { findFirst: vi.fn() },
    userRole: { create: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../../lib/events", () => ({
  appEvents: { emit: vi.fn(), on: vi.fn() },
}));

describe("auth.service.register: default role", () => {
  beforeEach(() => vi.clearAllMocks());

  const newUser = { id: "user-1", email: "a@example.com", tier: "free" };

  it("assigns the default role to a new user", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue(newUser);
    (prisma.role.findFirst as any).mockResolvedValue({ id: "role-member" });

    await authService.register({ email: "a@example.com", password: "SecurePass1" });

    expect(prisma.role.findFirst).toHaveBeenCalledWith({ where: { isDefault: true } });
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", roleId: "role-member" },
    });
  });

  it("still registers the user when no default role exists", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue(newUser);
    (prisma.role.findFirst as any).mockResolvedValue(null);

    const result = await authService.register({ email: "a@example.com", password: "SecurePass1" });

    expect(result).toHaveProperty("id", "user-1");
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });
});

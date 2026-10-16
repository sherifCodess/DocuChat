import { describe, it, expect, vi, beforeEach } from "vitest";
import { requirePermission } from "../authorize";
import { getUserPermissions } from "../../services/user.service";
import { ForbiddenError } from "../../lib/errors";

vi.mock("../../services/user.service", () => ({
  getUserPermissions: vi.fn(),
}));

async function run(middleware: any, user?: { id: string; role: string }) {
  const next = vi.fn();
  await middleware({ user } as any, {} as any, next);
  return next;
}

describe("requirePermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request with no authenticated user", async () => {
    const next = await run(requirePermission("documents:read"));
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    expect(getUserPermissions).not.toHaveBeenCalled();
  });

  it("allows a user who has the permission", async () => {
    (getUserPermissions as any).mockResolvedValue(new Set(["documents:read"]));
    const next = await run(requirePermission("documents:read"), { id: "u1", role: "free" });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects with a generic 403 that does not name the permission", async () => {
    (getUserPermissions as any).mockResolvedValue(new Set(["documents:read"]));
    const next = await run(requirePermission("documents:delete"), { id: "u1", role: "free" });
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("You do not have the required permission.");
    expect(error.message).not.toContain("documents:delete");
  });

  it("requires ALL listed permissions, not just one", async () => {
    (getUserPermissions as any).mockResolvedValue(new Set(["documents:read"]));
    const user = { id: "u1", role: "free" };
    const partial = await run(requirePermission("documents:read", "documents:delete"), user);
    expect(partial.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    (getUserPermissions as any).mockResolvedValue(new Set(["documents:read", "documents:delete"]));
    const full = await run(requirePermission("documents:read", "documents:delete"), user);
    expect(full).toHaveBeenCalledWith();
  });

  it("passes unexpected failures on instead of swallowing them", async () => {
    const failure = new Error("database down");
    (getUserPermissions as any).mockRejectedValue(failure);
    const next = await run(requirePermission("documents:read"), { id: "u1", role: "free" });
    expect(next).toHaveBeenCalledWith(failure);
  });
});

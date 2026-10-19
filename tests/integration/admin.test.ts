import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase, createTestUser } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

const UNKNOWN_ID = "cmv6iwsd30000l8izshguar04";
let admin: string;
let adminId: string;
let member: string;
let targetId: string; // a user with no role
let target: string; // that user's access token

// Audit listeners run after the response is sent, so wait for the log row to appear.
async function waitForLog(action: string) {
  for (let i = 0; i < 40; i++) {
    const row = await prisma.usageLog.findFirst({ where: { action } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

const assign = (token: string, userId: string, roleName?: string) =>
  request(app)
    .post(`/api/v1/admin/users/${userId}/roles`)
    .set(bearer(token))
    .send(roleName === undefined ? {} : { roleName });

const revoke = (token: string, userId: string, roleName: string) =>
  request(app)
    .delete(`/api/v1/admin/users/${userId}/roles/${roleName}`)
    .set(bearer(token));

beforeEach(async () => {
  await resetDatabase();
  admin = (await createAndLogin("admin@example.com", "admin")).accessToken;
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } })).id;
  member = (await createAndLogin("member@example.com")).accessToken;
  targetId = (await createTestUser({ email: "target@example.com" }, null)).id;
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "target@example.com", password: "TestPassword1!" });
  target = login.body.accessToken;
});

describe("admin routes: access", () => {
  it("gives non-admins a 403 and anonymous callers a 401", async () => {
    const list = await request(app).get("/api/v1/admin/roles").set(bearer(member));
    expect(list.status).toBe(403);
    expect((await assign(member, targetId, "viewer")).status).toBe(403);
    expect((await revoke(member, targetId, "viewer")).status).toBe(403);
    const anonymous = await request(app).get("/api/v1/admin/roles");
    expect(anonymous.status).toBe(401);
  });

  it("lists roles with their permissions and user counts", async () => {
    const res = await request(app).get("/api/v1/admin/roles").set(bearer(admin));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.data.map((r: any) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual(["admin", "member", "viewer"]);
    expect(byName.admin.permissions).toHaveLength(9);
    expect(byName.member.permissions).toHaveLength(5);
    expect(byName.viewer.permissions).toHaveLength(2);
    expect(byName.member.isDefault).toBe(true);
    expect(byName.admin.userCount).toBe(1);
    expect(byName.member.userCount).toBe(1);
  });
});

describe("admin routes: assigning and revoking roles", () => {
  it("assigns a role, records who did it, and access changes immediately", async () => {
    const before = await request(app).get("/api/v1/documents").set(bearer(target));
    expect(before.status).toBe(403);

    const res = await assign(admin, targetId, "viewer");
    expect(res.status).toBe(200);

    const after = await request(app).get("/api/v1/documents").set(bearer(target));
    expect(after.status).toBe(200);

    const link = await prisma.userRole.findFirstOrThrow({ where: { userId: targetId } });
    expect(link.assignedBy).toBe(adminId);
  });

  it("treats assigning the same role twice as harmless", async () => {
    expect((await assign(admin, targetId, "viewer")).status).toBe(200);
    expect((await assign(admin, targetId, "viewer")).status).toBe(200);
    expect(await prisma.userRole.count({ where: { userId: targetId } })).toBe(1);
  });

  it("rejects bad input and unknown users or roles", async () => {
    expect((await assign(admin, "hello", "viewer")).status).toBe(400);
    expect((await assign(admin, targetId)).status).toBe(400);
    expect((await assign(admin, UNKNOWN_ID, "viewer")).status).toBe(404);
    expect((await assign(admin, targetId, "no-such-role")).status).toBe(404);
  });

  it("revokes a role and access is lost immediately", async () => {
    await assign(admin, targetId, "viewer");
    const allowed = await request(app).get("/api/v1/documents").set(bearer(target));
    expect(allowed.status).toBe(200);

    const res = await revoke(admin, targetId, "viewer");
    expect(res.status).toBe(200);

    const denied = await request(app).get("/api/v1/documents").set(bearer(target));
    expect(denied.status).toBe(403);
    expect((await revoke(admin, targetId, "no-such-role")).status).toBe(404);
  });

  it("logs assignments and revocations to the audit trail", async () => {
    await assign(admin, targetId, "viewer");
    await revoke(admin, targetId, "viewer");

    const assigned = await waitForLog("role_assigned");
    const revoked = await waitForLog("role_revoked");
    expect(assigned).not.toBeNull();
    expect(revoked).not.toBeNull();
    expect(assigned!.userId).toBe(adminId);
    expect(JSON.parse(assigned!.metadata!).targetUserId).toBe(targetId);
    expect(JSON.parse(revoked!.metadata!).roleName).toBe("viewer");
  });
});

describe("admin routes: last admin guard", () => {
  const holders = () =>
    prisma.userRole.count({ where: { role: { name: "admin" } } });

  it("refuses to revoke the last remaining admin", async () => {
    const res = await revoke(admin, adminId, "admin");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNPROCESSABLE_ENTITY");
    expect(res.body.error.message).toBe("Cannot revoke the last remaining admin");
    expect(await holders()).toBe(1);

    // Still an admin, and nothing was logged as revoked
    const stillAdmin = await request(app).get("/api/v1/admin/roles").set(bearer(admin));
    expect(stillAdmin.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.usageLog.count({ where: { action: "role_revoked" } })).toBe(0);
  });

  it("allows revoking an admin, even your own, while another admin remains", async () => {
    expect((await assign(admin, targetId, "admin")).status).toBe(200);
    expect(await holders()).toBe(2);

    const res = await revoke(admin, adminId, "admin");
    expect(res.status).toBe(200);
    expect(await holders()).toBe(1);

    const lost = await request(app).get("/api/v1/admin/roles").set(bearer(admin));
    expect(lost.status).toBe(403);
  });

  it("never lets two simultaneous revocations remove every admin", async () => {
    const { accessToken: admin2 } = await createAndLogin("admin2@example.com", "admin");
    const admin2Id = (
      await prisma.user.findUniqueOrThrow({ where: { email: "admin2@example.com" } })
    ).id;

    const results = await Promise.all([
      revoke(admin, admin2Id, "admin"),
      revoke(admin2, adminId, "admin"),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await holders()).toBe(1);
  });
});

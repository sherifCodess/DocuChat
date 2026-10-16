import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase } from "../helpers/setup";
import { bearer } from "../helpers/auth";

beforeEach(async () => {
  await resetDatabase();
});

describe("default role on registration", () => {
  it("gives a newly registered user the member role", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "fresh@example.com", password: "SecurePass1" });
    expect(res.status).toBe(201);

    const roles = await prisma.userRole.findMany({
      where: { userId: res.body.data.id },
      include: { role: true },
    });
    expect(roles.map((r) => r.role.name)).toEqual(["member"]);
  });

  it("lets a freshly registered user create a document straight away", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "fresh@example.com", password: "SecurePass1" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "fresh@example.com", password: "SecurePass1" });

    const create = await request(app)
      .post("/api/v1/documents")
      .set(bearer(login.body.accessToken))
      .send({ title: "First", content: "Hello" });
    expect(create.status).toBe(201);
  });
});

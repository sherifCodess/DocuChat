import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

let productionApp: any;
let admin: string;
let member: string;

beforeAll(async () => {
  await resetDatabase();
  admin = (await createAndLogin("admin@example.com", "admin")).accessToken;
  member = (await createAndLogin("member@example.com")).accessToken;

  // A second copy of the app, started as if NODE_ENV were production
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  productionApp = (await import("../../src/app")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Bull Board access", () => {
  it("is open outside production (as the doc allows for development)", async () => {
    const res = await request(app).get("/admin/queues");
    expect(res.status).toBe(200);
  });

  it("requires a token in production", async () => {
    const res = await request(productionApp).get("/admin/queues");
    expect(res.status).toBe(401);
  });

  it("requires the roles:manage permission in production", async () => {
    const res = await request(productionApp).get("/admin/queues").set(bearer(member));
    expect(res.status).toBe(403);
  });

  it("lets an admin in during production", async () => {
    const res = await request(productionApp).get("/admin/queues").set(bearer(admin));
    expect(res.status).toBe(200);
  });
});

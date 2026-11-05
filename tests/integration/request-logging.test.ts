import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("correlation id on responses", () => {
  it("adds a generated id to every response", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-correlation-id"]).toMatch(UUID);
  });

  it("echoes a safe id sent by the client", async () => {
    const res = await request(app).get("/health").set("X-Correlation-Id", "support-ticket-42");
    expect(res.headers["x-correlation-id"]).toBe("support-ticket-42");
  });

  it("replaces an unsafe id, including on error responses", async () => {
    const res = await request(app).get("/api/v1/nope").set("X-Correlation-Id", "x".repeat(100));
    expect(res.status).toBe(404);
    expect(res.headers["x-correlation-id"]).toMatch(UUID);
  });
});

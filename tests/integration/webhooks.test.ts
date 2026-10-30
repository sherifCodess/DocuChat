import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { logger } from "../../src/lib/logger";
import { resetDatabase } from "../helpers/setup";

const SECRET = process.env.EXAMPLE_WEBHOOK_SECRET!;
const sign = (body: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

const post = (body: string, signature?: string, contentType = "application/json") => {
  let req = request(app).post("/webhooks/example").set("Content-Type", contentType);
  if (signature) req = req.set("X-Webhook-Signature", signature);
  return req.send(body);
};

const event = (id: string, type = "example.ping") =>
  JSON.stringify({ id, type, data: { n: 1 } });

async function waitFor<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timed out waiting for the condition");
}

const processed = (id: string) =>
  waitFor(async () => {
    const row = await prisma.webhookEvent.findUnique({ where: { id } });
    return row?.processedAt ? row : null;
  });

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhook signature", () => {
  it("returns 401 for a wrong signature", async () => {
    const body = event("evt_1");
    const res = await post(body, sign(body, "some-other-secret"));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid signature" });
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("returns 401 when the signature header is missing", async () => {
    const res = await post(event("evt_2"));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing signature header" });
  });

  it("returns 401 when the body was changed after signing", async () => {
    const signature = sign(event("evt_3"));
    const res = await post(event("evt_3-tampered"), signature);
    expect(res.status).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("answers 500 when the body could not be captured (wrong content type)", async () => {
    const body = event("evt_4");
    const res = await post(body, sign(body), "text/plain");
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Raw body not captured");
  });
});

describe("webhook processing and idempotency", () => {
  it("accepts a valid event with 202, records it and marks it processed afterwards", async () => {
    const body = event("evt_10");
    const res = await post(body, sign(body));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ received: true });

    const row = await processed("evt_10");
    expect(row).toMatchObject({ provider: "example", eventType: "example.ping" });
    expect(JSON.parse(row.payload)).toMatchObject({ id: "evt_10", data: { n: 1 } });
  });

  it("processes an event delivered twice only once", async () => {
    const info = vi.spyOn(logger, "info");
    const body = event("evt_11");

    expect((await post(body, sign(body))).status).toBe(202);
    await processed("evt_11");

    const second = await post(body, sign(body));
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });

    expect(await prisma.webhookEvent.count({ where: { id: "evt_11" } })).toBe(1);
    const handled = info.mock.calls.filter((c: any[]) => c[0]?.event === "webhook:unhandled_event");
    expect(handled).toHaveLength(1);
  });

  it("processes a half-processed event when it is delivered again", async () => {
    await prisma.webhookEvent.create({
      data: { id: "evt_12", provider: "example", eventType: "example.ping", payload: "{}" },
    });
    const body = event("evt_12");
    expect((await post(body, sign(body))).status).toBe(202);
    const row = await processed("evt_12");
    expect(row.processedAt).not.toBeNull();
  });

  it("leaves processedAt empty when processing fails", async () => {
    const error = vi.spyOn(logger, "error");
    vi.spyOn(logger, "info").mockImplementation((obj: any) => {
      if (obj?.event === "webhook:unhandled_event") throw new Error("boom");
    });

    const body = event("evt_13");
    expect((await post(body, sign(body))).status).toBe(202);

    await waitFor(async () =>
      error.mock.calls.some((c: any[]) => c[0]?.event === "webhook:processing_failed"),
    );
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: "evt_13" } });
    expect(row.processedAt).toBeNull();
  });

  it("returns 400 for a signed payload that is not JSON or lacks an id or a type", async () => {
    const bodies = ["this is not json", JSON.stringify({ type: "x" }), JSON.stringify({ id: "evt_14" })];
    for (const body of bodies) {
      const res = await post(body, sign(body));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid webhook payload" });
    }
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
});

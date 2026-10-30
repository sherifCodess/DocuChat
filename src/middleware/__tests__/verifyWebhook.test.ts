import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature } from "../verifyWebhook";

const SECRET = "unit-test-secret";
const sign = (body: string) =>
  crypto.createHmac("sha256", SECRET).update(body).digest("hex");

function run(middleware: any, request: { headers?: any; rawBody?: any }) {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  middleware({ headers: {}, ...request } as any, res, next);
  return { res, next };
}

describe("verifyWebhookSignature", () => {
  const mw = verifyWebhookSignature(SECRET, "X-Sig");

  it("fails closed when no secret is configured", () => {
    const { res, next } = run(verifyWebhookSignature(undefined, "X-Sig"), {
      headers: { "x-sig": "abcd" },
      rawBody: Buffer.from("{}"),
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header", () => {
    const { res, next } = run(mw, { rawBody: Buffer.from("{}") });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing signature header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reports a missing raw body as a server problem", () => {
    const { res, next } = run(mw, { headers: { "x-sig": "abcd" } });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a correct signature", () => {
    const body = '{"id":"1"}';
    const { res, next } = run(mw, { headers: { "x-sig": sign(body) }, rawBody: Buffer.from(body) });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a signature made for a different body", () => {
    const { res, next } = run(mw, {
      headers: { "x-sig": sign('{"id":"1"}') },
      rawBody: Buffer.from('{"id":"2"}'),
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects signatures of the wrong length or that are not hex, without throwing", () => {
    const body = Buffer.from("{}");
    for (const bad of ["abcd", "not-hex-at-all", "00".repeat(40)]) {
      const { res, next } = run(mw, { headers: { "x-sig": bad }, rawBody: body });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { requestLogger } from "../requestLogger";
import { logger } from "../../lib/logger";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function run(headers: Record<string, string> = {}, statusCode = 200, user?: { id: string }) {
  const req: any = {
    headers: { "user-agent": "vitest", ...headers },
    method: "GET",
    path: "/api/v1/documents",
    ip: "1.2.3.4",
    user,
  };
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  const responseHeaders: Record<string, string> = {};
  res.setHeader = (name: string, value: string) => {
    responseHeaders[name] = value;
  };
  const next = vi.fn();
  requestLogger(req, res, next);
  return { req, res, responseHeaders, next };
}

let spies: Record<string, ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  spies = {};
  for (const level of ["http", "info", "warn", "error"] as const) {
    spies[level] = vi.spyOn(logger, level as any).mockImplementation((() => logger) as any);
  }
});

afterEach(() => vi.restoreAllMocks());

describe("requestLogger", () => {
  it("generates a correlation id, exposes it on the request and the response, and continues", () => {
    const { req, responseHeaders, next } = run();
    expect(req.correlationId).toMatch(UUID);
    expect(responseHeaders["X-Correlation-Id"]).toBe(req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps a safe correlation id supplied by the client", () => {
    const { req, responseHeaders } = run({ "x-correlation-id": "client-req_123.abc" });
    expect(req.correlationId).toBe("client-req_123.abc");
    expect(responseHeaders["X-Correlation-Id"]).toBe("client-req_123.abc");
  });

  it("replaces unsafe correlation ids with a generated one", () => {
    for (const bad of ["a".repeat(65), "has spaces", "line\nbreak", "<script>", ""]) {
      const { req } = run({ "x-correlation-id": bad });
      expect(req.correlationId).toMatch(UUID);
    }
  });

  it("logs the incoming request at http level", () => {
    const { req } = run();
    expect(spies.http).toHaveBeenCalledWith("Request received", {
      correlationId: req.correlationId,
      method: "GET",
      path: "/api/v1/documents",
      ip: "1.2.3.4",
      userAgent: "vitest",
    });
  });

  it("logs a completed request at info level with status, duration and user", () => {
    const { req, res } = run({}, 200, { id: "u1" });
    res.emit("finish");
    expect(spies.info).toHaveBeenCalledWith(
      "Request completed",
      expect.objectContaining({
        correlationId: req.correlationId,
        statusCode: 200,
        userId: "u1",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("logs a client error at warn level", () => {
    const { res } = run({}, 404);
    res.emit("finish");
    expect(spies.warn).toHaveBeenCalledWith("Request client error", expect.objectContaining({ statusCode: 404 }));
  });

  it("logs a server error at error level", () => {
    const { res } = run({}, 500);
    res.emit("finish");
    expect(spies.error).toHaveBeenCalledWith("Request failed", expect.objectContaining({ statusCode: 500 }));
  });
});

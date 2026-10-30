import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { AxiosError } from "axios";
import { openaiClient } from "../../src/lib/http/openai.client";
import { withRetry } from "../../src/lib/http/retry";
import { openaiBreaker } from "../../src/lib/http/openai.breaker";
import { logger } from "../../src/lib/logger";

// A local HTTP server stands in for the external API, so no real call is ever made.
type Reply = { status: number; headers?: Record<string, string>; body?: unknown };
let replies: Reply[] = [];
let fallbackReply: Reply = { status: 200, body: { ok: true } };
let hits = 0;
let server: http.Server;
let baseURL: string;
const originalBaseURL = openaiClient.defaults.baseURL;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits++;
    const reply = replies.shift() ?? fallbackReply;
    res.writeHead(reply.status, { "Content-Type": "application/json", ...(reply.headers ?? {}) });
    res.end(JSON.stringify(reply.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  openaiClient.defaults.baseURL = originalBaseURL;
  openaiBreaker.shutdown();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  replies = [];
  fallbackReply = { status: 200, body: { ok: true } };
  hits = 0;
  openaiClient.defaults.baseURL = baseURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = () => openaiClient.get("/models");
const fast = { baseDelayMs: 5 };

describe("HTTP client interceptors", () => {
  it("logs a response error with its status when the server answered", async () => {
    const error = vi.spyOn(logger, "error");
    replies = [{ status: 404, body: { error: "nope" } }];
    await expect(get()).rejects.toBeInstanceOf(AxiosError);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "openai:error_response", status: 404 }),
    );
  });

  it("logs a different event when no response arrives at all", async () => {
    const error = vi.spyOn(logger, "error");
    openaiClient.defaults.baseURL = "http://127.0.0.1:1"; // nothing listens on port 1
    await expect(get()).rejects.toBeInstanceOf(AxiosError);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ event: "openai:no_response" }));
  });

  it("warns when the rate limit budget is running low", async () => {
    const warn = vi.spyOn(logger, "warn");
    replies = [{ status: 200, headers: { "x-ratelimit-remaining-requests": "10" } }];
    await get();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "openai:rate_limit_low", remaining: 10 }),
    );
  });

  it("stays quiet when there is plenty of budget left", async () => {
    const warn = vi.spyOn(logger, "warn");
    replies = [{ status: 200, headers: { "x-ratelimit-remaining-requests": "3490" } }];
    await get();
    expect(warn).not.toHaveBeenCalledWith(expect.objectContaining({ event: "openai:rate_limit_low" }));
  });
});

describe("withRetry", () => {
  it("does NOT retry a 400", async () => {
    replies = [{ status: 400 }];
    await expect(withRetry(get, fast)).rejects.toBeInstanceOf(AxiosError);
    expect(hits).toBe(1);
  });

  it("does not retry other permanent errors (401, 403, 404)", async () => {
    for (const status of [401, 403, 404]) {
      hits = 0;
      replies = [{ status }];
      await expect(withRetry(get, fast)).rejects.toBeInstanceOf(AxiosError);
      expect(hits).toBe(1);
    }
  });

  it("DOES retry a 503 until it succeeds", async () => {
    replies = [{ status: 503 }, { status: 503 }];
    const response = await withRetry(get, fast);
    expect(response.status).toBe(200);
    expect(hits).toBe(3);
  });

  it("gives up after the maximum number of attempts", async () => {
    fallbackReply = { status: 503 };
    await expect(withRetry(get, fast)).rejects.toBeInstanceOf(AxiosError);
    expect(hits).toBe(3);
  });

  it("retries a 408 as a transient failure", async () => {
    replies = [{ status: 408 }];
    const response = await withRetry(get, fast);
    expect(response.status).toBe(200);
    expect(hits).toBe(2);
  });

  it("honors a Retry-After header given in seconds", async () => {
    replies = [{ status: 429, headers: { "Retry-After": "1" } }];
    const start = Date.now();
    const response = await withRetry(get, fast);
    expect(response.status).toBe(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
    expect(hits).toBe(2);
  });

  it("falls back to the normal backoff when Retry-After is an HTTP date", async () => {
    replies = [{ status: 429, headers: { "Retry-After": "Wed, 21 Oct 2099 07:28:00 GMT" } }];
    const start = Date.now();
    const response = await withRetry(get, fast);
    expect(response.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(800);
  });

  it("retries a network error and then gives up", async () => {
    const warn = vi.spyOn(logger, "warn");
    openaiClient.defaults.baseURL = "http://127.0.0.1:1";
    await expect(withRetry(get, fast)).rejects.toBeInstanceOf(AxiosError);
    const retries = warn.mock.calls.filter((c: any[]) => c[0]?.event === "http:retry");
    expect(retries).toHaveLength(2);
  });
});

describe("circuit breaker", () => {
  afterEach(() => {
    openaiBreaker.close();
  });

  it("has listeners for open, halfOpen and close", () => {
    for (const name of ["open", "halfOpen", "close"]) {
      expect(openaiBreaker.listenerCount(name)).toBeGreaterThan(0);
    }
  });

  it("trips after repeated transient failures, then fails fast without calling the API", async () => {
    fallbackReply = { status: 503 };
    const warn = vi.spyOn(logger, "warn");

    const first = await Promise.allSettled(
      Array.from({ length: 5 }, () => openaiBreaker.fire("/embeddings", {})),
    );
    for (const result of first) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason.message).toBe(
        "OpenAI is temporarily unavailable. Please try again shortly.",
      );
    }
    expect(openaiBreaker.opened).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: "openai:breaker_open" }));

    const hitsBefore = hits;
    const start = Date.now();
    await expect(openaiBreaker.fire("/embeddings", {})).rejects.toThrow("temporarily unavailable");
    expect(Date.now() - start).toBeLessThan(500);
    expect(hits).toBe(hitsBefore);
  }, 30000);

  it("is not tripped by permanent client errors, which come back unchanged", async () => {
    fallbackReply = { status: 400, body: { error: "bad request" } };
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => openaiBreaker.fire("/embeddings", {})),
    );
    for (const result of results) {
      expect(result.status).toBe("rejected");
      const reason = (result as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(AxiosError);
      expect(reason.response.status).toBe(400);
    }
    expect(openaiBreaker.opened).toBe(false);
    expect(hits).toBe(6);
  }, 30000);
});

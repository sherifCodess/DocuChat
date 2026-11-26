import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { etag } from "../etag";

function createResponse(ifNoneMatch?: string) {
  const res: any = {
    req: { headers: { "if-none-match": ifNoneMatch } },
    setHeader: vi.fn(),
    status: vi.fn(function (this: any) {
      return this;
    }),
    end: vi.fn(function (this: any) {
      return this;
    }),
    json: vi.fn(function (this: any) {
      return this;
    }),
  };

  return res;
}

function tagFor(body: unknown) {
  return `"${createHash("sha1")
    .update(JSON.stringify(body))
    .digest("base64")}"`;
}

describe("etag middleware", () => {
  const body = { success: true, data: { id: "d1" } };

  it("sets an ETag and sends JSON when no validator matches", () => {
    const res = createResponse();
    const originalJson = res.json;
    const next = vi.fn();

    etag({} as any, res, next);
    res.json(body);

    expect(next).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith("ETag", tagFor(body));
    expect(originalJson).toHaveBeenCalledWith(body);
  });

  it("returns 304 for a matching strong validator", () => {
    const res = createResponse(tagFor(body));
    const originalJson = res.json;

    etag({} as any, res, vi.fn());
    res.json(body);

    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalledOnce();
    expect(originalJson).not.toHaveBeenCalled();
  });

  it("supports weak and comma-separated validators", () => {
    const res = createResponse(`"other", W/${tagFor(body)}`);

    etag({} as any, res, vi.fn());
    res.json(body);

    expect(res.status).toHaveBeenCalledWith(304);
  });

  it("supports the wildcard validator", () => {
    const res = createResponse("*");

    etag({} as any, res, vi.fn());
    res.json(body);

    expect(res.status).toHaveBeenCalledWith(304);
  });
});

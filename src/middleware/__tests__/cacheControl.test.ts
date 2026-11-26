import { describe, expect, it, vi } from "vitest";
import { noStore, privateNoCache } from "../cacheControl";

function createResponse() {
  return { setHeader: vi.fn() } as any;
}

describe("cache-control middleware", () => {
  it("marks authenticated data private and requiring revalidation", () => {
    const res = createResponse();
    const next = vi.fn();

    privateNoCache({} as any, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-cache",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("prevents authentication responses from being stored", () => {
    const res = createResponse();
    const next = vi.fn();

    noStore({} as any, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
  });
});

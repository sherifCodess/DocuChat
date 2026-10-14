import { describe, it, expect, vi } from "vitest";
import { errorHandler } from "../errorHandler";
import { NotFoundError, ValidationError } from "../../lib/errors";

// Silence and observe logging without loading config
vi.mock("../../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function call(err: any) {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  errorHandler(err, {} as any, res, vi.fn());
  return res;
}

describe("errorHandler", () => {
  it("returns operational errors with their own status, code and message", () => {
    const res = call(new NotFoundError("Document not found"));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Document not found" },
    });
  });

  it("includes details when an operational error carries them", () => {
    const details = [{ field: "email", message: "Invalid" }];
    const res = call(new ValidationError("Bad input", details));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.details).toEqual(details);
  });

  it("never leaks the message or stack of a programming error", () => {
    const res = call(new Error("secret database password in message"));
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("maps body parser errors to 400 and 413", () => {
    const malformed = Object.assign(new SyntaxError("Unexpected token"), {
      type: "entity.parse.failed",
    });
    const tooLarge = Object.assign(new Error("too large"), {
      type: "entity.too.large",
    });
    const a = call(malformed);
    expect(a.status).toHaveBeenCalledWith(400);
    expect(a.json.mock.calls[0][0].error.code).toBe("BAD_REQUEST");
    const b = call(tooLarge);
    expect(b.status).toHaveBeenCalledWith(413);
    expect(b.json.mock.calls[0][0].error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

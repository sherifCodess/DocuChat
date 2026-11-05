import { describe, it, expect } from "vitest";
import { scrubSensitiveData } from "../scrub";

describe("scrubSensitiveData", () => {
  it("redacts bearer tokens", () => {
    const out = scrubSensitiveData("header was Bearer eyJhbGciOi.abc-def_ghi trailing");
    expect(out).toBe("header was [REDACTED] trailing");
  });

  it("redacts OpenAI style keys", () => {
    const key = "sk-" + "a1B2c3D4e5F6g7H8i9J0k1L2";
    expect(scrubSensitiveData(`key=${key}`)).toBe("key=[REDACTED]");
  });

  it("redacts password assignments in several formats", () => {
    for (const text of ['password=hunter2', 'password: hunter2', '"password":"hunter2"', "PASSWORD = 'hunter2'"]) {
      const out = scrubSensitiveData(`failed with ${text} on connect`);
      expect(out).toContain("[REDACTED]");
      expect(out).not.toContain("hunter2");
    }
  });

  it("leaves ordinary text alone", () => {
    expect(scrubSensitiveData("Document uploaded for user u1")).toBe("Document uploaded for user u1");
  });

  it("returns anything that is not a string unchanged", () => {
    const value = { a: 1 };
    expect(scrubSensitiveData(value)).toBe(value);
    expect(scrubSensitiveData(42)).toBe(42);
    expect(scrubSensitiveData(null)).toBeNull();
  });
});

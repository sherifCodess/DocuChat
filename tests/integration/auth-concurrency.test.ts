import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { resetDatabase, createTestUser } from "../helpers/setup";

beforeEach(async () => {
  await resetDatabase();
  await createTestUser({ email: "user@example.com" });
});

describe("simultaneous logins", () => {
  it("issues a distinct refresh token to each login of the same user", async () => {
    const logins = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/auth/login")
          .send({ email: "user@example.com", password: "TestPassword1!" }),
      ),
    );
    expect(logins.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const tokens = logins.map((r) => r.body.refreshToken);
    expect(new Set(tokens).size).toBe(5);
  });
});

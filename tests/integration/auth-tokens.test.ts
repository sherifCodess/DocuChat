import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/app";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

beforeEach(async () => {
  await resetDatabase();
});

const refresh = (refreshToken: string) =>
  request(app).post("/api/v1/auth/refresh").send({ refreshToken });

describe("token lifecycle", () => {
  it("rotates the refresh token and rejects the old one", async () => {
    const { refreshToken } = await createAndLogin("user@example.com");
    const rotated = await refresh(refreshToken);
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(refreshToken);
    const reuse = await refresh(refreshToken);
    expect(reuse.status).toBe(401);
  });

  it("rejects an access token used as a refresh token, and the reverse", async () => {
    const { accessToken, refreshToken } = await createAndLogin("user@example.com");
    const asRefresh = await refresh(accessToken);
    expect(asRefresh.status).toBe(401);
    const asBearer = await request(app).get("/api/v1/documents").set(bearer(refreshToken));
    expect(asBearer.status).toBe(401);
  });

  it("revokes the refresh token on logout", async () => {
    const { refreshToken } = await createAndLogin("user@example.com");
    const out = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(out.status).toBe(200);
    const after = await refresh(refreshToken);
    expect(after.status).toBe(401);
  });

  it("returns 401 'Token expired' for an expired access token", async () => {
    const expired = jwt.sign(
      { sub: "someone", role: "free", type: "access" },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -10 },
    );
    const res = await request(app).get("/api/v1/documents").set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Token expired");
  });

  it("rejects bad refresh input and unknown routes with the error envelope", async () => {
    const empty = await request(app).post("/api/v1/auth/refresh").send({});
    expect(empty.status).toBe(400);
    const garbage = await refresh("abc");
    expect(garbage.status).toBe(401);
    const missing = await request(app).get("/api/v1/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });
});

import request from "supertest";
import app from "../../src/app";
import { createTestUser } from "./setup";

// Creates a user and logs in. Returns both tokens.
export async function createAndLogin(email: string) {
  await createTestUser({ email });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "TestPassword1!" });
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

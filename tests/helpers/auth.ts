import request from "supertest";
import app from "../../src/app";
import { createTestUser } from "./setup";

// Creates a user with the given role (default "member", or null for none) and logs in.
export async function createAndLogin(
  email: string,
  roleName: string | null = "member",
) {
  await createTestUser({ email }, roleName);
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "TestPassword1!" });
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

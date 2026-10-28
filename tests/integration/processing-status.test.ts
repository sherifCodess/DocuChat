import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { documentQueue } from "../../src/queues/document.queue";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

const UNKNOWN_ID = "cmv6iwsd30000l8izshguar04";
let owner: string;
let ownerId: string;
let other: string;
let admin: string;
let noRole: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).id;
  other = (await createAndLogin("other@example.com")).accessToken;
  admin = (await createAndLogin("admin@example.com", "admin")).accessToken;
  noRole = (await createAndLogin("norole@example.com", null)).accessToken;
});

const createDoc = async (extra: object = {}) =>
  (await prisma.document.create({ data: { userId: ownerId, title: "Doc", content: "Hello", ...extra } })).id;

const status = (token: string, id: string) =>
  request(app).get(`/api/v1/documents/${id}/processing-status`).set(bearer(token));

describe("GET /documents/:id/processing-status", () => {
  it("reports the status, no error and no progress when no job is running", async () => {
    const id = await createDoc();
    const res = await status(owner, id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "pending", error: null, progress: null });
  });

  it("reports the progress of this document's job and ignores other documents' jobs", async () => {
    const id = await createDoc({ status: "processing" });
    (documentQueue.getJobs as any).mockResolvedValueOnce([
      { data: { documentId: "someone-else" }, progress: 90 },
      { data: { documentId: id }, progress: 40 },
    ]);
    const res = await status(owner, id);
    expect(res.body.data).toEqual({ status: "processing", error: null, progress: 40 });
  });

  it("reports why a document failed", async () => {
    const id = await createDoc({ status: "failed", error: "boom" });
    const res = await status(owner, id);
    expect(res.body.data).toEqual({ status: "failed", error: "boom", progress: null });
  });

  it("is owner only: another member and even an admin get a 404", async () => {
    const id = await createDoc();
    expect((await status(other, id)).status).toBe(404);
    expect((await status(admin, id)).status).toBe(404);
  });

  it("handles unknown, deleted, malformed ids, missing permission and no token", async () => {
    const deleted = await createDoc({ deletedAt: new Date() });
    expect((await status(owner, UNKNOWN_ID)).status).toBe(404);
    expect((await status(owner, deleted)).status).toBe(404);
    expect((await status(owner, "hello")).status).toBe(400);
    expect((await status(noRole, await createDoc())).status).toBe(403);
    const anonymous = await request(app).get(`/api/v1/documents/${UNKNOWN_ID}/processing-status`);
    expect(anonymous.status).toBe(401);
  });
});

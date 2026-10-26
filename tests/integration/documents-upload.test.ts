import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { queueDocumentForProcessing } from "../../src/queues/document.queue";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

let owner: string;
let ownerId: string;
let viewer: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).id;
  viewer = (await createAndLogin("viewer@example.com", "viewer")).accessToken;
  vi.mocked(queueDocumentForProcessing).mockClear();
});

const upload = (token: string, body: object) =>
  request(app).post("/api/v1/documents").set(bearer(token)).send(body);

describe("document upload", () => {
  it("answers 202 with the pending document, its filename and the job id", async () => {
    const res = await upload(owner, { title: "My First Doc", content: "Hello world" });
    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBe("test-job-id");
    expect(res.body.data.document).toMatchObject({
      title: "My First Doc",
      filename: "my-first-doc",
      status: "pending",
      chunkCount: 0,
    });
  });

  it("queues exactly one processing job for the new document", async () => {
    const res = await upload(owner, { title: "Queued", content: "Hello" });
    expect(queueDocumentForProcessing).toHaveBeenCalledTimes(1);
    expect(queueDocumentForProcessing).toHaveBeenCalledWith(res.body.data.document.id, ownerId);
  });

  it("queues nothing for invalid input or a missing permission", async () => {
    expect((await upload(owner, {})).status).toBe(400);
    expect((await upload(viewer, { title: "x", content: "y" })).status).toBe(403);
    expect(queueDocumentForProcessing).not.toHaveBeenCalled();
  });
});

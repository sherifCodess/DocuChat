import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// These tests use the REAL queue, worker and Redis (every other test file uses fakes).
// Redis must be running (docker start redis) and no other worker may be attached: stop `npm run dev`.
vi.unmock("../../src/queues/connection");
vi.unmock("../../src/queues/document.queue");
vi.unmock("../../src/queues/dead-letter.queue");
vi.unmock("../../src/queues/document.worker");

// Simulated failure for the retry tests: any document containing the marker makes chunking throw.
vi.mock("../../src/lib/chunker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/chunker")>();
  return {
    ...actual,
    splitIntoChunks: (text: string, max?: number) => {
      if (text.includes("__FAIL__")) throw new Error("simulated failure");
      return actual.splitIntoChunks(text, max);
    },
  };
});

import { prisma } from "../../src/lib/prisma";
import { redisConnection } from "../../src/queues/connection";
import { documentQueue, queueDocumentForProcessing } from "../../src/queues/document.queue";
import { deadLetterQueue } from "../../src/queues/dead-letter.queue";
import { worker } from "../../src/queues/document.worker";
import { resetDatabase, createTestUser } from "../helpers/setup";

let userId: string;

async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 20000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for the condition");
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const createDoc = (title: string, content: string, extra: object = {}) =>
  prisma.document.create({ data: { userId, title, filename: title, content, ...extra } });

const jobCompleted = (jobId: string) =>
  waitFor(async () => {
    const job = await documentQueue.getJob(jobId);
    return job && (await job.isCompleted()) ? job : null;
  });

const deadLetterFor = (documentId: string) =>
  waitFor(async () => {
    const jobs = await deadLetterQueue.getJobs(["waiting"]);
    return jobs.find((j) => j.data.data?.documentId === documentId) ?? null;
  });

const quickRetries = { attempts: 3, backoff: { type: "fixed" as const, delay: 50 } };

beforeAll(async () => {
  await documentQueue.waitUntilReady();
  await worker.waitUntilReady();
  const workers = await documentQueue.getWorkers();
  if (workers.length > 1) {
    throw new Error(
      "Another worker is attached to the document-processing queue. Is `npm run dev` running? Stop it before running the queue tests.",
    );
  }
});

beforeEach(async () => {
  await resetDatabase();
  userId = (await createTestUser({ email: "queue@example.com" })).id;
});

afterAll(async () => {
  await worker.close();
  await documentQueue.close();
  await deadLetterQueue.close();
  await redisConnection.quit();
});

describe("document processing worker (real Redis)", () => {
  it("turns a pending document into a ready one with chunks, using the queue's retry settings", async () => {
    const doc = await createDoc("Long document", words(1200));
    expect(doc.status).toBe("pending");

    const jobId = (await queueDocumentForProcessing(doc.id, userId))!;
    const job = await jobCompleted(jobId);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.status).toBe("ready");
    expect(after.chunkCount).toBe(3);

    const chunks = await prisma.chunk.findMany({ where: { documentId: doc.id }, orderBy: { index: "asc" } });
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(chunks.map((c) => c.tokenCount)).toEqual([665, 665, 266]);

    expect(job.returnvalue).toEqual({ success: true, chunks: 3 });
    expect(job.progress).toBe(100);
    expect(job.opts.attempts).toBe(3);
    expect(job.opts.backoff).toEqual({ type: "exponential", delay: 2000 });
  }, 30000);

  it("is idempotent: processing the same document twice leaves one set of chunks", async () => {
    const doc = await createDoc("Twice", words(700));
    await jobCompleted((await queueDocumentForProcessing(doc.id, userId))!);
    await jobCompleted((await queueDocumentForProcessing(doc.id, userId))!);

    expect(await prisma.chunk.count({ where: { documentId: doc.id } })).toBe(2);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.chunkCount).toBe(2);
    expect(after.status).toBe("ready");
  }, 30000);

  it("retries a failing job, marks the document failed only on the last attempt, then dead-letters it", async () => {
    const doc = await createDoc("Broken", "__FAIL__ this document cannot be chunked");

    const statuses: string[] = [];
    const record = async (job: any) => {
      if (job?.data.documentId !== doc.id) return;
      const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      statuses.push(row.status);
    };
    worker.on("failed", record);

    try {
      await documentQueue.add(
        "process-document",
        { documentId: doc.id, userId, queuedAt: Date.now() },
        quickRetries,
      );
      const dlq = await deadLetterFor(doc.id);

      // Attempts 1 and 2 leave the document processing, only attempt 3 marks it failed
      expect(statuses).toEqual(["processing", "processing", "failed"]);
      const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(after.status).toBe("failed");
      expect(after.error).toBe("simulated failure");
      expect(await prisma.chunk.count({ where: { documentId: doc.id } })).toBe(0);

      expect(dlq.data).toMatchObject({
        originalQueue: "document-processing",
        error: "simulated failure",
        attempts: 3,
        data: { documentId: doc.id },
      });
      await dlq.remove();
    } finally {
      worker.off("failed", record);
    }
  }, 30000);

  it("never processes a soft-deleted document", async () => {
    const doc = await createDoc("Deleted", words(100), { deletedAt: new Date() });

    await documentQueue.add(
      "process-document",
      { documentId: doc.id, userId, queuedAt: Date.now() },
      { attempts: 2, backoff: { type: "fixed", delay: 50 } },
    );
    const dlq = await deadLetterFor(doc.id);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.status).toBe("pending");
    expect(await prisma.chunk.count({ where: { documentId: doc.id } })).toBe(0);
    await dlq.remove();
  }, 30000);
});

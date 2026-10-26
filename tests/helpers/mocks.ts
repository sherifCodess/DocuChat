import { vi } from "vitest";

// Every test file gets harmless fakes instead of the real queue, worker and Redis connection,
// so tests are deterministic and need no Redis. tests/queue/* un-mocks them to use the real ones.
vi.mock("../../src/queues/connection", () => ({
  redisConnection: {},
}));

vi.mock("../../src/queues/document.queue", () => ({
  documentQueue: { name: "document-processing", add: vi.fn(), getJobs: vi.fn().mockResolvedValue([]) },
  queueDocumentForProcessing: vi.fn().mockResolvedValue("test-job-id"),
}));

vi.mock("../../src/queues/dead-letter.queue", () => ({
  deadLetterQueue: { name: "dead-letter", add: vi.fn(), getJobs: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../../src/queues/document.worker", () => ({
  worker: { on: vi.fn(), close: vi.fn() },
}));

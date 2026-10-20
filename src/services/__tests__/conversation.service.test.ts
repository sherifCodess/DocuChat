import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../conversation.service";
import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";

// tx is what the transaction callback receives. Everything else on prisma must stay untouched.
vi.mock("../../lib/prisma", () => {
  const tx = {
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    document: { findFirst: vi.fn() },
    message: { create: vi.fn() },
    usageLog: { create: vi.fn() },
  };
  return {
    prisma: {
      $transaction: vi.fn((callback: any) => callback(tx)),
      conversation: { findFirst: vi.fn(), update: vi.fn() },
      document: { findFirst: vi.fn() },
      message: { create: vi.fn() },
      usageLog: { create: vi.fn() },
      __tx: tx,
    },
  };
});

const tx = (prisma as any).__tx;

describe("conversation.service.sendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.conversation.findFirst.mockResolvedValue({ id: "c1" });
    tx.message.create
      .mockResolvedValueOnce({ id: "m1", role: "user" })
      .mockResolvedValueOnce({ id: "m2", role: "assistant" });
  });

  it("writes every record through the transaction client only", async () => {
    const result = await sendMessage("u1", "c1", { content: "hello" });

    expect(result).toEqual({
      userMessage: { id: "m1", role: "user" },
      assistantMessage: { id: "m2", role: "assistant" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.message.create).toHaveBeenCalledTimes(2);
    expect(tx.message.create.mock.calls.map((c: any) => c[0].data.role)).toEqual(["user", "assistant"]);
    expect(tx.conversation.update).toHaveBeenCalledTimes(1);
    expect(tx.usageLog.create).toHaveBeenCalledWith({
      data: { userId: "u1", action: "chat", tokens: 0, costUsd: 0 },
    });

    // The global client is never used inside the transaction
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.usageLog.create).not.toHaveBeenCalled();
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  it("lets a failing step propagate so the transaction rolls back", async () => {
    const failure = new Error("usage log failed");
    tx.usageLog.create.mockRejectedValue(failure);
    await expect(sendMessage("u1", "c1", { content: "hello" })).rejects.toBe(failure);
  });

  it("writes nothing when the conversation is not the user's", async () => {
    tx.conversation.findFirst.mockResolvedValue(null);
    await expect(sendMessage("u1", "c1", { content: "hello" })).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(tx.usageLog.create).not.toHaveBeenCalled();
  });
});

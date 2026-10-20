import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase, waitForLog } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

const PLACEHOLDER = "AI response placeholder (Week 4)";
let owner: string;
let ownerId: string;
let other: string;
let otherId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).id;
  other = (await createAndLogin("other@example.com")).accessToken;
  otherId = (await prisma.user.findUniqueOrThrow({ where: { email: "other@example.com" } })).id;
});

const createConversation = (token: string, body: object = {}) =>
  request(app).post("/api/v1/conversations").set(bearer(token)).send(body);

const send = (token: string, conversationId: string, body: object) =>
  request(app)
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set(bearer(token))
    .send(body);

const createDoc = async (token: string, title = "Doc") =>
  (
    await request(app)
      .post("/api/v1/documents")
      .set(bearer(token))
      .send({ title, content: "Hello" })
  ).body.data.id as string;

describe("conversation list", () => {
  it("returns the latest message, the count, and the most recently active first", async () => {
    const a = (await createConversation(owner, { title: "A" })).body.data.id;
    await createConversation(owner, { title: "B" });
    await send(owner, a, { content: "question" });

    const res = await request(app).get("/api/v1/conversations").set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: any) => c.title)).toEqual(["A", "B"]);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ["id", "lastMessage", "messageCount", "title", "updatedAt"],
    );
    expect(res.body.data[0].messageCount).toBe(2);
    expect(res.body.data[0].lastMessage).toMatchObject({ role: "assistant", content: PLACEHOLDER });
    expect(res.body.data[1].messageCount).toBe(0);
    expect(res.body.data[1].lastMessage).toBeNull();
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2 });
  });

  it("paginates and validates page and limit", async () => {
    await createConversation(owner, { title: "1" });
    await createConversation(owner, { title: "2" });
    await createConversation(owner, { title: "3" });

    const page2 = await request(app)
      .get("/api/v1/conversations?page=2&limit=2")
      .set(bearer(owner));
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3 });

    const tooBig = await request(app).get("/api/v1/conversations?limit=500").set(bearer(owner));
    expect(tooBig.status).toBe(400);
    const zero = await request(app).get("/api/v1/conversations?page=0").set(bearer(owner));
    expect(zero.status).toBe(400);
  });
});

describe("sendMessage: one transaction", () => {
  it("creates both messages, touches the conversation and logs usage", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const before = await prisma.conversation.findUniqueOrThrow({ where: { id } });

    const res = await send(owner, id, { content: "What is this?" });
    expect(res.status).toBe(201);
    expect(res.body.data.userMessage).toMatchObject({ role: "user", content: "What is this?" });
    expect(res.body.data.assistantMessage).toMatchObject({
      role: "assistant",
      content: PLACEHOLDER,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    });

    const after = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    const log = await waitForLog("chat");
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(ownerId);
  });

  it("attaches a document to both messages", async () => {
    const docId = await createDoc(owner);
    const id = (await createConversation(owner)).body.data.id;
    const res = await send(owner, id, { content: "About this", documentId: docId });
    expect(res.status).toBe(201);
    expect(res.body.data.userMessage.documentId).toBe(docId);
    expect(res.body.data.assistantMessage.documentId).toBe(docId);
  });

  it("writes nothing when the document is unknown, someone else's, or deleted", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const othersDoc = await createDoc(other);
    const deletedDoc = await createDoc(owner, "Soon gone");
    await prisma.document.update({ where: { id: deletedDoc }, data: { deletedAt: new Date() } });
    const before = await prisma.conversation.findUniqueOrThrow({ where: { id } });

    for (const documentId of ["cmv6iwsd30000l8izshguar04", othersDoc, deletedDoc]) {
      const res = await send(owner, id, { content: "hi", documentId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("UNPROCESSABLE_ENTITY");
    }

    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
    expect(await prisma.usageLog.count({ where: { action: "chat" } })).toBe(0);
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("refuses to start a conversation about a deleted or someone else's document", async () => {
    const othersDoc = await createDoc(other);
    const deletedDoc = await createDoc(owner, "Soon gone");
    await prisma.document.update({ where: { id: deletedDoc }, data: { deletedAt: new Date() } });
    expect((await createConversation(owner, { documentId: othersDoc })).status).toBe(422);
    expect((await createConversation(owner, { documentId: deletedDoc })).status).toBe(422);
  });

  it("keeps another user's conversation untouched", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const res = await send(other, id, { content: "intruder" });
    expect(res.status).toBe(404);
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
    expect(otherId).not.toBe(ownerId);
  });
});

describe("database transactions", () => {
  // This checks the database and adapter, not sendMessage: a failing later step undoes the earlier writes.
  it("rolls back every write when a later step throws", async () => {
    const id = (await createConversation(owner)).body.data.id;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.message.create({
          data: { conversationId: id, role: "user", content: "should vanish" },
        });
        await tx.usageLog.create({
          data: { userId: ownerId, action: "chat", tokens: 0, costUsd: 0 },
        });
        throw new Error("a later step failed");
      }),
    ).rejects.toThrow("a later step failed");

    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
    expect(await prisma.usageLog.count({ where: { action: "chat" } })).toBe(0);
  });
});

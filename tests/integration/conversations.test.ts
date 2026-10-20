import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

const UNKNOWN_ID = "cmv6iwsd30000l8izshguar04";
let owner: string;
let other: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  other = (await createAndLogin("other@example.com")).accessToken;
});

const createConversation = (token: string, body: object = {}) =>
  request(app).post("/api/v1/conversations").set(bearer(token)).send(body);

describe("conversations", () => {
  it("creates one with a default title", async () => {
    const res = await createConversation(owner);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("New conversation");
    expect(res.body.data.documentId).toBeNull();
  });

  it("links a real document, rejects an unknown or malformed one", async () => {
    const doc = await request(app)
      .post("/api/v1/documents")
      .set(bearer(owner))
      .send({ title: "Doc", content: "Hello" });
    const linked = await createConversation(owner, { documentId: doc.body.data.id });
    expect(linked.status).toBe(201);
    const unknown = await createConversation(owner, { documentId: UNKNOWN_ID });
    expect(unknown.status).toBe(422);
    const bad = await createConversation(owner, { documentId: "nope" });
    expect(bad.status).toBe(400);
  });

  it("lists only the caller's conversations", async () => {
    await createConversation(owner, { title: "Mine" });
    await createConversation(other, { title: "Theirs" });
    const res = await request(app).get("/api/v1/conversations").set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: any) => c.title)).toEqual(["Mine"]);
  });

  it("stores messages and returns them oldest first", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const send = (content: string) =>
      request(app)
        .post(`/api/v1/conversations/${id}/messages`)
        .set(bearer(owner))
        .send({ content });
    expect((await send("First")).status).toBe(201);
    expect((await send("Second")).status).toBe(201);
    const res = await request(app)
      .get(`/api/v1/conversations/${id}/messages`)
      .set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: any) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(res.body.data.map((m: any) => m.content)).toEqual([
      "First",
      "AI response placeholder (Week 4)",
      "Second",
      "AI response placeholder (Week 4)",
    ]);
    expect(res.body.data[0].role).toBe("user");
  });

  it("validates messages and protects other users' conversations", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const empty = await request(app)
      .post(`/api/v1/conversations/${id}/messages`)
      .set(bearer(owner))
      .send({ content: "" });
    expect(empty.status).toBe(400);
    const intruderSend = await request(app)
      .post(`/api/v1/conversations/${id}/messages`)
      .set(bearer(other))
      .send({ content: "hi" });
    expect(intruderSend.status).toBe(404);
    const intruderRead = await request(app)
      .get(`/api/v1/conversations/${id}/messages`)
      .set(bearer(other));
    expect(intruderRead.status).toBe(404);
    const badId = await request(app)
      .get("/api/v1/conversations/hello/messages")
      .set(bearer(owner));
    expect(badId.status).toBe(400);
    const unknown = await request(app)
      .get(`/api/v1/conversations/${UNKNOWN_ID}/messages`)
      .set(bearer(owner));
    expect(unknown.status).toBe(404);
  });
});

describe("conversations: permissions", () => {
  let viewer: string;
  let noRole: string;

  beforeEach(async () => {
    viewer = (await createAndLogin("viewer@example.com", "viewer")).accessToken;
    noRole = (await createAndLogin("norole@example.com", null)).accessToken;
  });

  it("lets a viewer read but not start conversations or send messages", async () => {
    const id = (await createConversation(owner)).body.data.id;

    const list = await request(app).get("/api/v1/conversations").set(bearer(viewer));
    expect(list.status).toBe(200);

    // Reading someone else's conversation is still a 404, not a 403
    const read = await request(app)
      .get(`/api/v1/conversations/${id}/messages`)
      .set(bearer(viewer));
    expect(read.status).toBe(404);

    const create = await createConversation(viewer);
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");

    const send = await request(app)
      .post(`/api/v1/conversations/${id}/messages`)
      .set(bearer(viewer))
      .send({ content: "hi" });
    expect(send.status).toBe(403);
  });

  it("gives a user with no role a 403 on every conversation route", async () => {
    const id = (await createConversation(owner)).body.data.id;
    const calls = [
      request(app).get("/api/v1/conversations").set(bearer(noRole)),
      createConversation(noRole),
      request(app).get(`/api/v1/conversations/${id}/messages`).set(bearer(noRole)),
      request(app)
        .post(`/api/v1/conversations/${id}/messages`)
        .set(bearer(noRole))
        .send({ content: "hi" }),
    ];
    const results = await Promise.all(calls);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
  });
});

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
    expect(res.body.data.map((m: any) => m.content)).toEqual(["First", "Second"]);
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

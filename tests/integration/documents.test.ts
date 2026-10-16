import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { resetDatabase } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

const UNKNOWN_ID = "cmv6iwsd30000l8izshguar04";
let owner: string; // member
let other: string; // member
let admin: string;
let viewer: string;
let noRole: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  other = (await createAndLogin("other@example.com")).accessToken;
  admin = (await createAndLogin("admin@example.com", "admin")).accessToken;
  viewer = (await createAndLogin("viewer@example.com", "viewer")).accessToken;
  noRole = (await createAndLogin("norole@example.com", null)).accessToken;
});

const createDoc = (token: string, title = "Doc") =>
  request(app)
    .post("/api/v1/documents")
    .set(bearer(token))
    .send({ title, content: "Hello" });

describe("documents", () => {
  it("creates a document with status pending", async () => {
    const res = await createDoc(owner);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("pending");
  });

  it("lists every missing field on invalid input", async () => {
    const res = await request(app)
      .post("/api/v1/documents")
      .set(bearer(owner))
      .send({});
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: any) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["title", "content"]));
  });

  it("returns own document, 404 for another member's", async () => {
    const id = (await createDoc(owner)).body.data.id;
    const mine = await request(app).get(`/api/v1/documents/${id}`).set(bearer(owner));
    expect(mine.status).toBe(200);
    const theirs = await request(app).get(`/api/v1/documents/${id}`).set(bearer(other));
    expect(theirs.status).toBe(404);
  });

  it("returns 400 for a malformed id and 404 for an unknown one", async () => {
    const bad = await request(app).get("/api/v1/documents/hello").set(bearer(owner));
    expect(bad.status).toBe(400);
    const unknown = await request(app).get(`/api/v1/documents/${UNKNOWN_ID}`).set(bearer(owner));
    expect(unknown.status).toBe(404);
  });

  it("paginates and filters by status", async () => {
    await createDoc(owner, "A");
    await createDoc(owner, "B");
    await createDoc(owner, "C");
    const page = await request(app)
      .get("/api/v1/documents?page=1&limit=2")
      .set(bearer(owner));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
    const ready = await request(app)
      .get("/api/v1/documents?status=ready")
      .set(bearer(owner));
    expect(ready.body.meta.total).toBe(0);
    const tooBig = await request(app)
      .get("/api/v1/documents?limit=500")
      .set(bearer(owner));
    expect(tooBig.status).toBe(400);
  });
});

describe("documents: permissions", () => {
  it("lets a viewer read documents but not create them", async () => {
    const list = await request(app).get("/api/v1/documents").set(bearer(viewer));
    expect(list.status).toBe(200);
    const create = await createDoc(viewer);
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");
  });

  it("stops a member from deleting, and the document survives", async () => {
    const id = (await createDoc(owner)).body.data.id;
    const del = await request(app).delete(`/api/v1/documents/${id}`).set(bearer(owner));
    expect(del.status).toBe(403);
    const get = await request(app).get(`/api/v1/documents/${id}`).set(bearer(owner));
    expect(get.status).toBe(200);
  });

  it("gives a user with no role a 403 on every document route", async () => {
    const id = (await createDoc(owner)).body.data.id;
    const calls = [
      request(app).get("/api/v1/documents").set(bearer(noRole)),
      request(app).post("/api/v1/documents").set(bearer(noRole)).send({ title: "x", content: "y" }),
      request(app).get(`/api/v1/documents/${id}`).set(bearer(noRole)),
      request(app).delete(`/api/v1/documents/${id}`).set(bearer(noRole)),
    ];
    const results = await Promise.all(calls);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
  });

  it("lets an admin read another user's document, but not a member", async () => {
    const id = (await createDoc(owner)).body.data.id;
    const asAdmin = await request(app).get(`/api/v1/documents/${id}`).set(bearer(admin));
    expect(asAdmin.status).toBe(200);
    const asMember = await request(app).get(`/api/v1/documents/${id}`).set(bearer(other));
    expect(asMember.status).toBe(404);
    // The list still shows only your own documents
    const adminList = await request(app).get("/api/v1/documents").set(bearer(admin));
    expect(adminList.body.meta.total).toBe(0);
  });

  it("lets an admin soft delete any document", async () => {
    const id = (await createDoc(owner)).body.data.id;
    const del = await request(app).delete(`/api/v1/documents/${id}`).set(bearer(admin));
    expect(del.status).toBe(200);
    const again = await request(app).delete(`/api/v1/documents/${id}`).set(bearer(admin));
    expect(again.status).toBe(404);
    const get = await request(app).get(`/api/v1/documents/${id}`).set(bearer(owner));
    expect(get.status).toBe(404);
    const list = await request(app).get("/api/v1/documents").set(bearer(owner));
    expect(list.body.meta.total).toBe(0);
  });

  it("returns 404 when an admin deletes a document that doesn't exist", async () => {
    const del = await request(app).delete(`/api/v1/documents/${UNKNOWN_ID}`).set(bearer(admin));
    expect(del.status).toBe(404);
  });
});

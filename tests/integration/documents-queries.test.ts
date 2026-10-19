import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase, waitForLog } from "../helpers/setup";
import { createAndLogin, bearer } from "../helpers/auth";

let owner: string;
let ownerId: string;
let admin: string;
let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = (await createAndLogin("owner@example.com")).accessToken;
  ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).id;
  admin = (await createAndLogin("admin@example.com", "admin")).accessToken;
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } })).id;
});

const seedDoc = (title: string, extra: Record<string, unknown> = {}) =>
  prisma.document.create({
    data: { userId: ownerId, title, content: "Hello", ...extra },
  });

const createDoc = (token: string, title: string) =>
  request(app)
    .post("/api/v1/documents")
    .set(bearer(token))
    .send({ title, content: "Hello" });

const list = (qs = "") =>
  request(app).get(`/api/v1/documents${qs}`).set(bearer(owner));

const titles = (res: request.Response) => res.body.data.map((d: any) => d.title);

describe("document list: fields, sorting, filtering", () => {
  it("returns only the listed fields, without the content", async () => {
    await seedDoc("Alpha");
    const res = await list();
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ["chunkCount", "createdAt", "filename", "id", "status", "title", "updatedAt"],
    );
    expect(res.body.data[0].chunkCount).toBe(0);
    expect(res.body.data[0].filename).toBeNull();
  });

  it("sorts newest first by default, and by title or chunk count on request", async () => {
    await seedDoc("Alpha", { createdAt: new Date("2026-01-01"), chunkCount: 5 });
    await seedDoc("Bravo", { createdAt: new Date("2026-01-02"), chunkCount: 1 });
    await seedDoc("Charlie", { createdAt: new Date("2026-01-03"), chunkCount: 3 });

    expect(titles(await list())).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(titles(await list("?sortOrder=asc"))).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(titles(await list("?sortBy=title&sortOrder=asc"))).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(titles(await list("?sortBy=title"))).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(titles(await list("?sortBy=chunkCount&sortOrder=asc"))).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  it("combines status, search, sorting and pagination", async () => {
    await seedDoc("a test report", { status: "ready" });
    await seedDoc("another test", { status: "ready" });
    await seedDoc("unrelated", { status: "ready" });
    await seedDoc("test draft", { status: "pending" });

    const res = await list("?status=ready&search=test&sortBy=title&sortOrder=asc");
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(["a test report", "another test"]);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2 });

    const page2 = await list("?status=ready&search=test&sortBy=title&sortOrder=asc&limit=1&page=2");
    expect(titles(page2)).toEqual(["another test"]);
    expect(page2.body.meta.total).toBe(2);
  });

  it("ignores letter case when searching titles", async () => {
    await seedDoc("Annual REPORT");
    const res = await list("?search=report");
    expect(titles(res)).toEqual(["Annual REPORT"]);
  });

  it("rejects bad sort and search input", async () => {
    expect((await list("?sortBy=content")).status).toBe(400);
    expect((await list("?sortOrder=up")).status).toBe(400);
    expect((await list(`?search=${"a".repeat(201)}`)).status).toBe(400);
  });
});

describe("document delete: soft delete and audit trail", () => {
  it("keeps the row and records who deleted it", async () => {
    const id = (await createDoc(owner, "To delete")).body.data.id;
    const del = await request(app).delete(`/api/v1/documents/${id}`).set(bearer(admin));
    expect(del.status).toBe(200);

    const row = await prisma.document.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.deletedBy).toBe(adminId);
  });

  it("logs document creation and deletion to the audit trail", async () => {
    const id = (await createDoc(owner, "Audited")).body.data.id;
    await request(app).delete(`/api/v1/documents/${id}`).set(bearer(admin));

    const created = await waitForLog("document_created");
    const deleted = await waitForLog("document_deleted");
    expect(created).not.toBeNull();
    expect(deleted).not.toBeNull();
    expect(created!.userId).toBe(ownerId);
    expect(JSON.parse(created!.metadata!)).toMatchObject({ documentId: id, title: "Audited" });
    expect(deleted!.userId).toBe(adminId);
    expect(JSON.parse(deleted!.metadata!)).toMatchObject({ documentId: id, title: "Audited" });
  });
});


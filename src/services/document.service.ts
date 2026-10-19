import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { appEvents } from "../lib/events";
import { NotFoundError } from "../lib/errors";
import { DOC_EVENTS } from "../events/document.events";
import { getUserPermissions } from "./user.service";

export async function createDocument(
  userId: string,
  data: { title: string; content: string },
) {
  const doc = await prisma.document.create({
    data: { userId, title: data.title, content: data.content },
  });

  appEvents.emit(DOC_EVENTS.CREATED, {
    userId,
    documentId: doc.id,
    title: doc.title,
  });

  return doc;
}

interface ListDocumentsOptions {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy?: "createdAt" | "title" | "chunkCount";
  sortOrder?: "asc" | "desc";
}

export async function listDocuments(
  userId: string,
  options: ListDocumentsOptions,
) {
  const {
    page,
    limit,
    status,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  // Build the where clause dynamically
  const where: Prisma.DocumentWhereInput = {
    userId,
    deletedAt: null, // Soft delete filter
  };
  if (status) where.status = status;
  // Search by title. mode: 'insensitive' does not exist on SQLite; add it when moving to PostgreSQL.
  if (search) where.title = { contains: search };

  // id is a tie-breaker so pages are stable when the sort values are equal.
  const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [
    sortBy === "title"
      ? { title: sortOrder }
      : sortBy === "chunkCount"
        ? { chunkCount: sortOrder }
        : { createdAt: sortOrder },
    { id: "asc" },
  ];

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        filename: true,
        status: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.document.count({ where }),
  ]);

  return {
    data: documents,
    meta: { page, limit, total },
  };
}

// Not-yours and not-found look identical on purpose: a 403 would confirm the document exists.
export async function getDocument(userId: string, id: string) {
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
  });
  if (!doc) {
    throw new NotFoundError("Document not found");
  }

  // Resource ownership: you only see your own documents, except admins.
  if (doc.userId !== userId) {
    const permissions = await getUserPermissions(userId);
    if (!permissions.has("users:manage")) {
      throw new NotFoundError("Document not found");
    }
  }
  return doc;
}

// Soft delete. The route requires documents:delete (admin only), so there is no ownership check.
export async function deleteDocument(documentId: string, deletedBy: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
  });
  if (!doc) {
    throw new NotFoundError("Document not found");
  }

  // The deletedAt condition makes sure only one of two simultaneous deletes wins.
  const result = await prisma.document.updateMany({
    where: { id: documentId, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy },
  });
  if (result.count === 0) {
    throw new NotFoundError("Document not found");
  }

  appEvents.emit(DOC_EVENTS.DELETED, {
    deletedBy,
    documentId,
    title: doc.title,
  });
}

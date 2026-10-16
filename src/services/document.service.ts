import { prisma } from "../lib/prisma";
import { getUserPermissions } from "./user.service";

export async function createDocument(
  userId: string,
  data: { title: string; content: string },
) {
  return prisma.document.create({
    data: { userId, title: data.title, content: data.content },
  });
}

export async function listDocuments(
  userId: string,
  query: { page: number; limit: number; status?: string },
) {
  const where = {
    userId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.document.count({ where }),
  ]);
  return { items, total };
}

// Returns null if the document doesn't exist, is deleted, or the user may not see it.
// Not-yours and not-found look identical on purpose: a 403 would confirm the document exists.
export async function getDocument(userId: string, id: string) {
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
  });
  if (!doc) return null;

  // Resource ownership: you only see your own documents, except admins.
  if (doc.userId !== userId) {
    const permissions = await getUserPermissions(userId);
    if (!permissions.has("users:manage")) return null;
  }
  return doc;
}

// Soft delete. The route requires documents:delete (admin only), so there is no ownership check.
// Returns false if the document doesn't exist or is already deleted.
export async function deleteDocument(id: string) {
  const result = await prisma.document.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

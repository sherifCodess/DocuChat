import { prisma } from "../lib/prisma";

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

export async function getDocument(userId: string, id: string) {
  return prisma.document.findFirst({ where: { id, userId, deletedAt: null } });
}

// Soft delete: returns false if the document doesn't exist, isn't yours, or is already deleted.
export async function deleteDocument(userId: string, id: string) {
  const result = await prisma.document.updateMany({
    where: { id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

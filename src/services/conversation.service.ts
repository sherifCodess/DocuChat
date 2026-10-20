import { prisma } from "../lib/prisma";
import { AppError, NotFoundError } from "../lib/errors";

const DEFAULT_TITLE = "New conversation";

// Day 4: 422 means valid JSON that breaks a business rule (e.g. the referenced document doesn't exist).
const documentNotFound = () =>
  new AppError("Document not found", 422, "UNPROCESSABLE_ENTITY");

export async function listConversations(
  userId: string,
  options: { page: number; limit: number },
) {
  const { page, limit } = options;

  // The list and the count run in parallel. The latest message comes in the same query: no N+1.
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          // id breaks ties between messages created in the same millisecond
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1, // Only the latest message
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    }),
    prisma.conversation.count({ where: { userId } }),
  ]);

  return {
    data: conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      messageCount: conv._count.messages,
      lastMessage: conv.messages[0] || null,
      updatedAt: conv.updatedAt,
    })),
    meta: {
      page,
      limit,
      total,
    },
  };
}

export async function createConversation(
  userId: string,
  data: { title?: string; documentId?: string },
) {
  if (data.documentId) {
    // The document must exist, belong to the user and not be soft-deleted.
    const doc = await prisma.document.findFirst({
      where: { id: data.documentId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!doc) throw documentNotFound();
  }

  return prisma.conversation.create({
    data: {
      userId,
      documentId: data.documentId,
      title: data.title?.trim() || DEFAULT_TITLE,
    },
  });
}

export async function listMessages(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");

  return prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

// Everything inside the transaction callback uses tx, never the global prisma client.
// If any step throws, the whole transaction rolls back.
export async function sendMessage(
  userId: string,
  conversationId: string,
  data: { content: string; documentId?: string },
) {
  return prisma.$transaction(async (tx) => {
    // 1. Verify the conversation belongs to this user
    const conversation = await tx.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundError("Conversation not found");
    }

    // 2. A referenced document must exist, belong to the user and not be soft-deleted
    if (data.documentId) {
      const doc = await tx.document.findFirst({
        where: { id: data.documentId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!doc) throw documentNotFound();
    }

    // 3. Create the user's message
    const userMessage = await tx.message.create({
      data: {
        conversationId,
        documentId: data.documentId,
        role: "user",
        content: data.content,
      },
    });

    // 4. Touch the conversation's updatedAt
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // 5. In Week 4, this is where the RAG pipeline runs.
    //    For now, we create a placeholder assistant message.
    const assistantMessage = await tx.message.create({
      data: {
        conversationId,
        documentId: data.documentId,
        role: "assistant",
        content: "AI response placeholder (Week 4)",
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
      },
    });

    // 6. Log usage
    await tx.usageLog.create({
      data: {
        userId,
        action: "chat",
        tokens: 0, // Placeholder until Week 4
        costUsd: 0,
      },
    });

    return { userMessage, assistantMessage };
  });
}

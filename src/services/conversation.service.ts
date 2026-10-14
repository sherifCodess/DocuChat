import { prisma } from "../lib/prisma";

const DEFAULT_TITLE = "New conversation";

// A referenced document must exist, belong to the user and not be deleted.
async function documentUsable(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: { id: true },
  });
  return doc !== null;
}

async function ownsConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  return conversation !== null;
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createConversation(
  userId: string,
  data: { title?: string; documentId?: string },
) {
  if (data.documentId && !(await documentUsable(userId, data.documentId))) {
    return "invalid_document" as const;
  }
  return prisma.conversation.create({
    data: {
      userId,
      documentId: data.documentId,
      title: data.title?.trim() || DEFAULT_TITLE,
    },
  });
}

// Returns null if the conversation doesn't exist or isn't the user's.
export async function listMessages(userId: string, conversationId: string) {
  if (!(await ownsConversation(userId, conversationId))) return null;
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

// Week 4 will generate the assistant reply (RAG). For now this stores the user's message.
export async function sendMessage(
  userId: string,
  conversationId: string,
  data: { content: string; documentId?: string },
) {
  if (!(await ownsConversation(userId, conversationId))) {
    return "conversation_not_found" as const;
  }
  if (data.documentId && !(await documentUsable(userId, data.documentId))) {
    return "invalid_document" as const;
  }
  return prisma.message.create({
    data: {
      conversationId,
      documentId: data.documentId,
      role: "user",
      content: data.content,
    },
  });
}

import { z } from "zod";
import { idSchema } from "./id.validator";

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().max(200).optional(),
    documentId: idSchema("Invalid document ID").optional(),
  }),
});

export const listConversationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const sendMessageSchema = z.object({
  params: z.object({
    id: idSchema("Invalid conversation ID"),
  }),
  body: z.object({
    content: z
      .string()
      .min(1, "Message cannot be empty")
      .max(10000, "Message too long"),
    documentId: idSchema("Invalid document ID").optional(),
  }),
});

export const conversationParamsSchema = z.object({
  params: z.object({
    id: idSchema("Invalid conversation ID"),
  }),
});

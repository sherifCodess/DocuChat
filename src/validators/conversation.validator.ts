import { z } from "zod";
import { idSchema } from "./id.validator";

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().max(200).optional(),
    documentId: idSchema("Invalid document ID").optional(),
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

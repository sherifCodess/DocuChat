import { Router, Response } from "express";
import * as conversationService from "../services/conversation.service";
import { validate } from "../middleware/validate";
import {
  createConversationSchema,
  conversationParamsSchema,
  sendMessageSchema,
} from "../validators/conversation.validator";

const router = Router();

// authenticate is applied where this router is mounted in app.ts.

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Conversation not found" },
  });
}

// Day 4: 422 means valid JSON that breaks a business rule (e.g. the referenced document doesn't exist).
function invalidDocument(res: Response) {
  return res.status(422).json({
    success: false,
    error: { code: "UNPROCESSABLE_ENTITY", message: "Document not found" },
  });
}

/**
 * @swagger
 * /conversations:
 *   get:
 *     summary: List user's conversations
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations, newest first
 *       401:
 *         description: Not authenticated
 */
router.get("/", async (req, res, next) => {
  try {
    const data = await conversationService.listConversations(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conversations:
 *   post:
 *     summary: Start a new conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               documentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Conversation created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       422:
 *         description: The referenced document doesn't exist
 */
router.post("/", validate(createConversationSchema), async (req, res, next) => {
  try {
    const result = await conversationService.createConversation(
      req.user!.id,
      req.body,
    );
    if (result === "invalid_document") return invalidDocument(res);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /conversations/{id}/messages:
 *   get:
 *     summary: Get messages in a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Messages, oldest first
 *       400:
 *         description: Invalid conversation ID
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Not found, or not owned by the user
 */
router.get(
  "/:id/messages",
  validate(conversationParamsSchema),
  async (req, res, next) => {
    try {
      const data = await conversationService.listMessages(
        req.user!.id,
        req.params.id as string,
      );
      if (!data) return notFound(res);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /conversations/{id}/messages:
 *   post:
 *     summary: Send a message (the AI reply arrives in Week 4)
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 10000
 *               documentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message stored
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found, or not owned by the user
 *       422:
 *         description: The referenced document doesn't exist
 */
router.post(
  "/:id/messages",
  validate(sendMessageSchema),
  async (req, res, next) => {
    try {
      const result = await conversationService.sendMessage(
        req.user!.id,
        req.params.id as string,
        req.body,
      );
      if (result === "conversation_not_found") return notFound(res);
      if (result === "invalid_document") return invalidDocument(res);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

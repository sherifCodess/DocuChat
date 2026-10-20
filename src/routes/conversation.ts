import { Router } from "express";
import * as conversationService from "../services/conversation.service";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createConversationSchema,
  listConversationsSchema,
  conversationParamsSchema,
  sendMessageSchema,
} from "../validators/conversation.validator";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /conversations:
 *   get:
 *     summary: List user's conversations
 *     description: Requires the conversations:read permission. Each item has the latest message and the message count. Most recently active first.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Conversations with pagination meta
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the conversations:read permission
 */
router.get(
  "/",
  requirePermission("conversations:read"),
  validate(listConversationsSchema),
  async (req, res, next) => {
    try {
      const { page, limit } = req.query as unknown as {
        page: number;
        limit: number;
      };
      const { data, meta } = await conversationService.listConversations(
        req.user!.id,
        { page, limit },
      );
      res.json({ success: true, data, meta });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /conversations:
 *   post:
 *     summary: Start a new conversation
 *     description: Requires the conversations:create permission.
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
 *       403:
 *         description: Missing the conversations:create permission
 *       422:
 *         description: The referenced document doesn't exist
 */
router.post(
  "/",
  requirePermission("conversations:create"),
  validate(createConversationSchema),
  async (req, res, next) => {
    try {
      const conversation = await conversationService.createConversation(
        req.user!.id,
        req.body,
      );
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /conversations/{id}/messages:
 *   get:
 *     summary: Get messages in a conversation
 *     description: Requires the conversations:read permission.
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
 *       403:
 *         description: Missing the conversations:read permission
 *       404:
 *         description: Not found, or not owned by the user
 */
router.get(
  "/:id/messages",
  requirePermission("conversations:read"),
  validate(conversationParamsSchema),
  async (req, res, next) => {
    try {
      const data = await conversationService.listMessages(
        req.user!.id,
        req.params.id as string,
      );
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
 *     summary: Send a message
 *     description: Requires the conversations:create permission. Stores your message and a placeholder assistant reply in one transaction (the real AI reply arrives in Week 4).
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
 *         description: Both messages stored (userMessage and assistantMessage)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the conversations:create permission
 *       404:
 *         description: Conversation not found, or not owned by the user
 *       422:
 *         description: The referenced document doesn't exist
 */
router.post(
  "/:id/messages",
  requirePermission("conversations:create"),
  validate(sendMessageSchema),
  async (req, res, next) => {
    try {
      const result = await conversationService.sendMessage(
        req.user!.id,
        req.params.id as string,
        req.body,
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

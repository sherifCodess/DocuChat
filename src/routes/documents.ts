import { Router, Response } from "express";
import * as documentService from "../services/document.service";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createDocumentSchema,
  listDocumentsSchema,
  documentParamsSchema,
} from "../validators/document.validator";

const router = Router();

router.use(authenticate);

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Document not found" },
  });
}

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: List user's documents
 *     description: Requires the documents:read permission.
 *     tags: [Documents]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, ready, failed]
 *     responses:
 *       200:
 *         description: List of documents, with pagination meta
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the documents:read permission
 */
router.get(
  "/",
  requirePermission("documents:read"),
  validate(listDocumentsSchema),
  async (req, res, next) => {
    try {
      const { page, limit, status } = req.query as unknown as {
        page: number;
        limit: number;
        status?: string;
      };
      const { items, total } = await documentService.listDocuments(
        req.user!.id,
        { page, limit, status },
      );
      res.json({ success: true, data: items, meta: { page, limit, total } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Create a document
 *     description: Requires the documents:create permission.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 500
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the documents:create permission
 */
router.post(
  "/",
  requirePermission("documents:create"),
  validate(createDocumentSchema),
  async (req, res, next) => {
    try {
      const doc = await documentService.createDocument(req.user!.id, req.body);
      res.status(201).json({ success: true, data: doc });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document by ID
 *     description: Requires the documents:read permission. You can only see your own documents; admins can see all.
 *     tags: [Documents]
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
 *         description: The document
 *       400:
 *         description: Invalid document ID
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the documents:read permission
 *       404:
 *         description: Not found, or not visible to the user
 */
router.get(
  "/:id",
  requirePermission("documents:read"),
  validate(documentParamsSchema),
  async (req, res, next) => {
    try {
      const doc = await documentService.getDocument(
        req.user!.id,
        req.params.id as string,
      );
      if (!doc) return notFound(res);
      res.json({ success: true, data: doc });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document (soft delete, admin only)
 *     description: Requires the documents:delete permission, which only admins have. Admins can delete any document.
 *     tags: [Documents]
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
 *         description: Document deleted
 *       400:
 *         description: Invalid document ID
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing the documents:delete permission
 *       404:
 *         description: Not found, or already deleted
 */
router.delete(
  "/:id",
  requirePermission("documents:delete"),
  validate(documentParamsSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const deleted = await documentService.deleteDocument(id);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

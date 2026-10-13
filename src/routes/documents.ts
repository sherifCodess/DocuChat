import { Router, Response } from "express";
import * as documentService from "../services/document.service";
import { validate } from "../middleware/validate";
import {
  createDocumentSchema,
  listDocumentsSchema,
  documentParamsSchema,
} from "../validators/document.validator";

const router = Router();

// authenticate is applied where this router is mounted in app.ts.

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
 */
router.get("/", validate(listDocumentsSchema), async (req, res, next) => {
  try {
    const { page, limit, status } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
    };
    const { items, total } = await documentService.listDocuments(req.user!.id, {
      page,
      limit,
      status,
    });
    res.json({ success: true, data: items, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Create a document
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
 */
router.post("/", validate(createDocumentSchema), async (req, res, next) => {
  try {
    const doc = await documentService.createDocument(req.user!.id, req.body);
    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document by ID
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
 *       404:
 *         description: Not found, or not owned by the user
 */
router.get("/:id", validate(documentParamsSchema), async (req, res, next) => {
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
});

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document (soft delete)
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
 *       404:
 *         description: Not found, not owned by the user, or already deleted
 */
router.delete(
  "/:id",
  validate(documentParamsSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const deleted = await documentService.deleteDocument(req.user!.id, id);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

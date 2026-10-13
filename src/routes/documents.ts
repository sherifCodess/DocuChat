import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validate } from "../middleware/validate";
import { listDocumentsSchema } from "../validators/document.validator";

const router = Router();

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
 *         description: List of documents
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
// authenticate is applied where this router is mounted in app.ts.
router.get("/", validate(listDocumentsSchema), async (req, res, next) => {
  try {
    const docs = await prisma.document.findMany({
      where: { userId: req.user!.id },
    });
    res.json({ success: true, data: docs });
  } catch (error) {
    next(error);
  }
});

export default router;

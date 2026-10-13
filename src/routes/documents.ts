import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validate } from "../middleware/validate";
import { listDocumentsSchema } from "../validators/document.validator";

const router = Router();

// GET /api/v1/documents: list the authenticated user's documents.
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

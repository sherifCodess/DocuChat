import { Router } from "express";
import { z } from "zod";
import { verifyWebhookSignature } from "../middleware/verifyWebhook";
import { prisma } from "../lib/prisma";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

const router = Router();

// A signed payload still has to carry an event id and a type
const eventShape = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
});

router.post(
  "/example",
  verifyWebhookSignature(config.EXAMPLE_WEBHOOK_SECRET, "X-Webhook-Signature"),
  async (req, res, next) => {
    try {
      // Body is still raw bytes here: parse it manually
      let event: any;
      try {
        event = JSON.parse((req as any).rawBody.toString());
      } catch {
        return res.status(400).json({ error: "Invalid webhook payload" });
      }
      if (!eventShape.safeParse(event).success) {
        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      // Idempotency check
      const existing = await prisma.webhookEvent.findUnique({
        where: { id: event.id },
      });

      if (existing?.processedAt) {
        // Already processed. Acknowledge without re-processing.
        return res.status(200).json({ received: true, duplicate: true });
      }

      // Record receipt (or update if half-processed)
      await prisma.webhookEvent.upsert({
        where: { id: event.id },
        update: {},
        create: {
          id: event.id,
          provider: "example",
          eventType: event.type,
          payload: JSON.stringify(event),
        },
      });

      // ACKNOWLEDGE FAST. Process after answering.
      res.status(202).json({ received: true });

      try {
        await processWebhookEvent(event);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (error) {
        logger.error({
          event: "webhook:processing_failed",
          webhookId: event.id,
          error: (error as Error).message,
        });
        // Don't mark processedAt, so the event stays unprocessed.
      }
    } catch (error) {
      next(error);
    }
  },
);

async function processWebhookEvent(event: any) {
  // Route to the right handler based on event type
  switch (event.type) {
    case "document.imported":
      // Queue document processing
      break;
    default:
      logger.info({ event: "webhook:unhandled_event", type: event.type });
  }
}

export default router;

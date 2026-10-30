import { config } from "./lib/config"; // must stay first: loads and validates .env
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./lib/logger";
import "./events/auth.events"; // registers the event listeners (Day 3)
import "./events/admin.events";
import "./events/document.events";
import "./queues/document.worker"; // starts the document processing worker (Day 3)
import { bullBoardAdapter } from "./config/bull-board";
import { authenticate } from "./middleware/auth";
import { requirePermission } from "./middleware/authorize";
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import conversationRoutes from "./routes/conversation";
import adminRoutes from "./routes/admin";
import webhookRoutes from "./routes/webhooks";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// === MIDDLEWARE (runs on every request) ===
app.use(helmet());
app.use(cors());
// Webhook routes need the RAW request body to verify signatures (Day 4).
// It must be captured BEFORE express.json() parses and discards the original bytes.
app.use(
  "/webhooks",
  express.raw({
    type: "application/json",
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.json());

// === REQUEST LOGGING ===
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  next();
});

// === HEALTH CHECK (no versioning needed) ===
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

// === API DOCS (Day 4) ===
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Also serve the raw JSON spec (useful for code generators)
app.get("/api-docs.json", (req, res) => {
  res.json(swaggerSpec);
});

// === API v1 ===
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/admin", adminRoutes);

// Webhooks (Day 4): signed by the provider, no login. The raw body was captured above.
app.use("/webhooks", webhookRoutes);

// Queue dashboard (Day 3): open in development, protected in production, as the doc advises
if (config.NODE_ENV === "production") {
  app.use("/admin/queues", authenticate, requirePermission("roles:manage"), bullBoardAdapter.getRouter());
} else {
  app.use("/admin/queues", bullBoardAdapter.getRouter());
}

// When v2 exists:
// app.use('/api/v2/documents', documentRoutesV2);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.path} not found` },
  });
});

// Global error handler (MUST be last)
app.use(errorHandler);
export default app;

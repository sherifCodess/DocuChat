import { config } from "./lib/config"; // must stay first: loads and validates .env
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./lib/logger";
import "./events/auth.events"; // registers the event listeners (Day 3)
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import conversationRoutes from "./routes/conversation";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// === MIDDLEWARE (runs on every request) ===
app.use(helmet());
app.use(cors());
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

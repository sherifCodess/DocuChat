import { config } from "./lib/config"; // must stay first: loads and validates .env
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./lib/logger";
import { authenticate } from "./middleware/auth";
import "./events/auth.events"; // registers the event listeners (Day 3)
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import conversationRoutes from "./routes/conversation";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";

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
app.use("/api/v1/documents", authenticate, documentRoutes);
app.use("/api/v1/conversations", authenticate, conversationRoutes);

// When v2 exists:
// app.use('/api/v2/documents', documentRoutesV2);

// Day 5 adds here, in this order: the 404 handler, then errorHandler (must be last)

export default app;

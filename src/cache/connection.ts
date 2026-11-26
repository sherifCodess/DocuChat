import IORedis from "ioredis";
import { config } from "../lib/config";

export const cacheRedis = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  enableOfflineQueue: false,
  retryStrategy: (times) => (times <= 2 ? 100 : null),
});

// Prevent an unhandled Redis error event from crashing the application.
// Cache operations handle their own failures and fall back to the database.
cacheRedis.on("error", () => {});

import IORedis from "ioredis";
import { config } from "../lib/config";

export const redisConnection = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: null, // Required by BullMQ
});

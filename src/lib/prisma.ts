import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { config } from "./config";

// Prisma 7 requires a driver adapter to connect
const adapter = new PrismaBetterSqlite3({ url: config.DATABASE_URL });

// Create ONE instance and export it
export const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
});

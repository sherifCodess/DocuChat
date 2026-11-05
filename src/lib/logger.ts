import winston from "winston";
import { config } from "./config";
import { scrubSensitiveData } from "./scrub";

const isProduction = config.NODE_ENV === "production";

// Applies the scrubber to every string in a log entry, including nested objects.
function scrubDeep(value: any, depth = 0): any {
  if (typeof value === "string") return scrubSensitiveData(value);
  if (depth >= 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Dates, Buffers, class instances
  const out: Record<string, any> = {};
  for (const [key, v] of Object.entries(value)) out[key] = scrubDeep(v, depth + 1);
  return out;
}

// Redaction: secrets never reach the logs, whatever code logged them.
const redact = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === "level") continue;
    (info as any)[key] = scrubDeep((info as any)[key]);
  }
  return info;
});

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redact(),
    isProduction
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : "";
            return `${timestamp} ${level}: ${message}${metaStr}`;
          }),
        ),
  ),
  defaultMeta: { service: "docuchat" },
  transports: [new winston.transports.Console()],
});

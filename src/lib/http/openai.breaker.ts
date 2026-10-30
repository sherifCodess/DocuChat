import CircuitBreaker from "opossum";
import { AxiosError } from "axios";
import { openaiClient } from "./openai.client";
import { withRetry } from "./retry";
import { logger } from "../logger";

// The function we're protecting
async function callOpenAI(path: string, body: any) {
  return withRetry(() => openaiClient.post(path, body));
}

// Permanent client errors (400, 401, 403, 404...) are our mistake, not a sign that OpenAI is down,
// so they must not trip the breaker. 408 and 429 are transient and still count.
function isPermanentClientError(error: unknown): boolean {
  if (!(error instanceof AxiosError) || !error.response) return false;
  const status = error.response.status;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// Wrap it in a circuit breaker
export const openaiBreaker = new CircuitBreaker(callOpenAI, {
  timeout: 35000, // Slightly longer than the client timeout
  errorThresholdPercentage: 50, // Open if 50% of recent requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 60000, // Track failures over a 60-second window
  rollingCountBuckets: 10,
  volumeThreshold: 5, // Need at least 5 calls before the breaker may open
  errorFilter: isPermanentClientError,
});

// Fallback when the breaker is open
openaiBreaker.fallback(() => {
  throw new Error("OpenAI is temporarily unavailable. Please try again shortly.");
});

// Visibility into state changes
openaiBreaker.on("open", () =>
  logger.warn({ event: "openai:breaker_open", message: "requests will fail fast" }),
);
openaiBreaker.on("halfOpen", () =>
  logger.warn({ event: "openai:breaker_half_open", message: "testing recovery" }),
);
openaiBreaker.on("close", () =>
  logger.info({ event: "openai:breaker_closed", message: "normal operation" }),
);

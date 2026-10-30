import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { logger } from "../logger";

export const openaiClient: AxiosInstance = axios.create({
  baseURL: "https://api.openai.com/v1",
  timeout: 30000, // 30 seconds for AI responses
  headers: {
    Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": "DocuChat/1.0",
  },
});

// Request interceptor: log every outgoing call
openaiClient.interceptors.request.use((requestConfig) => {
  const startTime = Date.now();
  (requestConfig as any).metadata = { startTime };
  logger.info({
    event: "openai:request",
    method: requestConfig.method?.toUpperCase(),
    url: requestConfig.url,
  });
  return requestConfig;
});

// Response interceptor: log timing, watch the rate limit headers, tell the three failure types apart
openaiClient.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any).metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : 0;
    logger.info({
      event: "openai:response",
      status: response.status,
      url: response.config.url,
      durationMs: duration,
    });

    // Rate limit headers (lesson 4.4): slow down before the limit, don't wait for the 429
    const remaining = parseInt(
      String(response.headers["x-ratelimit-remaining-requests"] ?? "999"),
      10,
    );
    if (remaining < 50) {
      logger.warn({ event: "openai:rate_limit_low", remaining });
    }

    return response;
  },
  (error) => {
    const startTime = error.config?.metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : 0;

    if (error.response) {
      // Server responded with error status
      logger.error({
        event: "openai:error_response",
        status: error.response.status,
        url: error.config?.url,
        durationMs: duration,
        data: error.response.data,
      });
    } else if (error.request) {
      // No response received (timeout, network error)
      logger.error({
        event: "openai:no_response",
        url: error.config?.url,
        durationMs: duration,
        error: error.message,
      });
    } else {
      logger.error({ event: "openai:request_setup_error", error: error.message });
    }

    return Promise.reject(error);
  },
);

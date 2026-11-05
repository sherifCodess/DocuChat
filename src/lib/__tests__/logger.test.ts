import { describe, it, expect, afterEach } from "vitest";
import winston from "winston";
import { Writable } from "stream";
import { logger } from "../logger";

let remove: () => void = () => {};

// Captures the final formatted output of the real logger
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const transport = new winston.transports.Stream({ stream });
  logger.add(transport);
  remove = () => logger.remove(transport);
  return lines;
}

afterEach(() => remove());

describe("logger", () => {
  it("writes the message, the structured fields and the service name", () => {
    const lines = capture();
    logger.info("Document uploaded", { userId: "u1", documentId: "d1" });
    const out = lines.join("");
    expect(out).toContain("Document uploaded");
    expect(out).toContain('"userId":"u1"');
    expect(out).toContain('"documentId":"d1"');
    expect(out).toContain('"service":"docuchat"');
  });

  it("redacts secrets that appear in the message", () => {
    const lines = capture();
    logger.info("calling with Bearer abc.def.ghi and password=hunter2");
    const out = lines.join("");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).not.toContain("hunter2");
  });

  it("redacts secrets nested inside structured fields", () => {
    const lines = capture();
    const key = "sk-" + "a1B2c3D4e5F6g7H8i9J0k1L2";
    logger.info("request", { headers: { authorization: "Bearer abc.def.ghi" }, list: [key] });
    const out = lines.join("");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).not.toContain(key);
  });

  it("redacts secrets in error messages and stack traces", () => {
    const lines = capture();
    logger.error(new Error("connect failed password=hunter2"));
    const out = lines.join("");
    expect(out).toContain("connect failed");
    expect(out).not.toContain("hunter2");
  });

  it("supports the http level used by the request logger", () => {
    const lines = capture();
    logger.http("Request received", { method: "GET" });
    expect(lines.join("")).toContain("Request received");
  });
});

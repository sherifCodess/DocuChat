// Day 3 (security): scrub sensitive values from anything that may be logged or reported
export function scrubSensitiveData(data: any): any {
  if (typeof data !== "string") return data;

  const patterns = [
    /Bearer [A-Za-z0-9\-._~+\/]+=*/g, // JWT tokens
    /sk-[A-Za-z0-9]{20,}/g, // OpenAI keys
    /password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, // password in any format
  ];

  let scrubbed = data;
  for (const pattern of patterns) {
    scrubbed = scrubbed.replace(pattern, "[REDACTED]");
  }
  return scrubbed;
}

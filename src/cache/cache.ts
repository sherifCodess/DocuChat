import { createHash, randomUUID } from "node:crypto";
import { cacheRedis } from "./connection";

const PREFIX = "docuchat:";

function keyOf(key: string): string {
  return `${PREFIX}${key}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const value = await cacheRedis.get(keyOf(key));
    return value === null ? null : (JSON.parse(value) as T);
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Cache TTL must be a positive integer.");
  }

  try {
    await cacheRedis.set(keyOf(key), JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Ordinary cache writes must not interrupt database-backed operations.
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await cacheRedis.del(keyOf(key));
  } catch {
    // Best-effort deletion for ordinary cache entries.
  }
}

/**
 * Strict invalidation for operations that must not silently ignore
 * a failed cache deletion.
 */
export async function cacheDelStrict(key: string): Promise<void> {
  await cacheRedis.del(keyOf(key));
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    await cacheDelPatternStrict(pattern);
  } catch {
    // Best-effort invalidation for ordinary cached data.
  }
}

export async function cacheDelPatternStrict(pattern: string): Promise<void> {
  let cursor = "0";

  do {
    const [nextCursor, keys] = await cacheRedis.scan(
      cursor,
      "MATCH",
      keyOf(pattern),
      "COUNT",
      100,
    );

    cursor = nextCursor;

    if (keys.length > 0) {
      await cacheRedis.del(...keys);
    }
  } while (cursor !== "0");
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);

  if (cached !== null) {
    return cached;
  }

  const lockKey = keyOf(`lock:${key}`);
  const lockToken = randomUUID();

  let lockAcquired = false;

  try {
    lockAcquired =
      (await cacheRedis.set(lockKey, lockToken, "PX", 5000, "NX")) === "OK";
  } catch {
    return loader();
  }

  if (!lockAcquired) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await cacheGet<T>(key);

      if (result !== null) {
        return result;
      }
    }

    return loader();
  }

  try {
    const value = await loader();
    await cacheSet(key, value, ttlSeconds);
    return value;
  } finally {
    try {
      await cacheRedis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end`,
        1,
        lockKey,
        lockToken,
      );
    } catch {
      // The lock expires automatically after five seconds.
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

export function hashKey(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

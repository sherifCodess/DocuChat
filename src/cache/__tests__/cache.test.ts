import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheRedis } from "../connection";
import {
  cacheDel,
  cacheDelPattern,
  cacheGet,
  cacheGetOrSet,
  cacheSet,
  hashKey,
} from "../cache";
import { CACHE_TTL } from "../ttl";

const redis = cacheRedis as any;

describe("cache helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    redis.scan.mockResolvedValue(["0", []]);
    redis.eval.mockResolvedValue(1);
  });

  it("uses the application namespace when reading and writing", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ id: "d1" }));

    await expect(cacheGet("doc:d1")).resolves.toEqual({ id: "d1" });
    await cacheSet("doc:d1", { id: "d1" }, CACHE_TTL.DOCUMENT_METADATA);

    expect(redis.get).toHaveBeenCalledWith("docuchat:doc:d1");
    expect(redis.set).toHaveBeenCalledWith(
      "docuchat:doc:d1",
      JSON.stringify({ id: "d1" }),
      "EX",
      600,
    );
  });

  it("treats invalid JSON and Redis read failures as cache misses", async () => {
    redis.get.mockResolvedValueOnce("not-json");
    await expect(cacheGet("broken")).resolves.toBeNull();

    redis.get.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(cacheGet("unavailable")).resolves.toBeNull();
  });

  it("rejects invalid TTL values", async () => {
    await expect(cacheSet("bad", "value", 0)).rejects.toThrow(
      "Cache TTL must be a positive integer.",
    );
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("deletes a namespaced key", async () => {
    await cacheDel("doc:d1");
    expect(redis.del).toHaveBeenCalledWith("docuchat:doc:d1");
  });

  it("uses SCAN rather than KEYS for pattern invalidation", async () => {
    redis.scan.mockResolvedValueOnce([
      "0",
      ["docuchat:conversations:u1:1:20", "docuchat:conversations:u1:2:20"],
    ]);

    await cacheDelPattern("conversations:u1:*");

    expect(redis.scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      "docuchat:conversations:u1:*",
      "COUNT",
      100,
    );
    expect(redis.del).toHaveBeenCalledWith(
      "docuchat:conversations:u1:1:20",
      "docuchat:conversations:u1:2:20",
    );
  });

  it("continues through multiple SCAN pages", async () => {
    redis.scan
      .mockResolvedValueOnce(["17", ["docuchat:conversations:u1:1:20"]])
      .mockResolvedValueOnce(["0", ["docuchat:conversations:u1:2:20"]]);

    await cacheDelPattern("conversations:u1:*");

    expect(redis.scan).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
  });

  it("returns a cached value without calling the loader", async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ value: 42 }));
    const loader = vi.fn().mockResolvedValue({ value: 0 });

    await expect(cacheGetOrSet("item", 60, loader)).resolves.toEqual({
      value: 42,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("loads and stores a cache miss while releasing its lock", async () => {
    const loader = vi.fn().mockResolvedValue({ value: 42 });
    redis.get.mockResolvedValueOnce(null);

    await expect(cacheGetOrSet("item", 60, loader)).resolves.toEqual({
      value: 42,
    });

    expect(loader).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      "docuchat:lock:item",
      expect.any(String),
      "PX",
      5000,
      "NX",
    );
    expect(redis.set).toHaveBeenNthCalledWith(
      2,
      "docuchat:item",
      JSON.stringify({ value: 42 }),
      "EX",
      60,
    );
    expect(redis.eval).toHaveBeenCalledOnce();
  });

  it("falls back to the loader when Redis is unavailable", async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.set.mockRejectedValueOnce(new Error("Redis unavailable"));
    const loader = vi.fn().mockResolvedValue("database-value");

    await expect(cacheGetOrSet("item", 60, loader)).resolves.toBe(
      "database-value",
    );
    expect(loader).toHaveBeenCalledOnce();
  });

  it("creates deterministic hashes regardless of object key order", () => {
    expect(hashKey({ page: 1, filter: { a: 2, b: 3 } })).toBe(
      hashKey({ filter: { b: 3, a: 2 }, page: 1 }),
    );
  });
});

import { describe, it, expect } from "vitest";
import { splitIntoChunks, estimateTokens } from "../chunker";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("splitIntoChunks", () => {
  it("splits text into chunks of at most the given number of words", () => {
    const chunks = splitIntoChunks(words(1200), 500);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.split(" ").length)).toEqual([500, 500, 200]);
  });

  it("keeps short text in a single chunk", () => {
    expect(splitIntoChunks("just a few words")).toEqual(["just a few words"]);
  });

  it("returns the original text when it has no words at all", () => {
    expect(splitIntoChunks("   ")).toEqual(["   "]);
  });
});

describe("estimateTokens", () => {
  it("estimates about 1.33 tokens per word, rounded up", () => {
    expect(estimateTokens(words(3))).toBe(4);
    expect(estimateTokens(words(500))).toBe(665);
  });
});

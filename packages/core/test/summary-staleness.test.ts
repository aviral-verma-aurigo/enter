import { describe, it, expect } from "vitest";
import { truncateSummary, SUMMARY_MAX_CHARS } from "../src/tools/remember.js";
import { staleness, STALE_AFTER_DAYS } from "../src/tools/recall.js";

describe("truncateSummary", () => {
  it("passes short summaries through untouched", () => {
    const r = truncateSummary("short and sweet");
    expect(r).toEqual({ value: "short and sweet", truncated: false });
  });

  it("passes exactly-max summaries through untouched", () => {
    const s = "x".repeat(SUMMARY_MAX_CHARS);
    expect(truncateSummary(s)).toEqual({ value: s, truncated: false });
  });

  it("truncates long summaries at a word boundary with ellipsis", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const r = truncateSummary(words);
    expect(r.truncated).toBe(true);
    expect(r.value.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(r.value.endsWith("…")).toBe(true);
    // Must not cut mid-word: the char before the ellipsis completes a whole wordN token.
    const beforeEllipsis = r.value.slice(0, -1).trimEnd();
    const lastToken = beforeEllipsis.split(" ").pop()!;
    expect(words.split(" ")).toContain(lastToken);
  });

  it("hard-cuts when there is no usable word boundary", () => {
    const s = "y".repeat(SUMMARY_MAX_CHARS * 2);
    const r = truncateSummary(s);
    expect(r.truncated).toBe(true);
    expect(r.value.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(r.value.endsWith("…")).toBe(true);
  });
});

describe("staleness", () => {
  const now = new Date("2026-11-24T12:00:00Z");

  it("returns empty for fresh memories", () => {
    expect(staleness("2026-11-20T12:00:00Z", now)).toBe("");
  });

  it("returns empty just under the threshold", () => {
    const justUnder = new Date(now.getTime() - (STALE_AFTER_DAYS - 1) * 86_400_000).toISOString();
    expect(staleness(justUnder, now)).toBe("");
  });

  it("marks memories at/over the threshold with day count", () => {
    const old = new Date(now.getTime() - 45 * 86_400_000).toISOString();
    expect(staleness(old, now)).toBe(" (aged: 45d old — re-verify before citing)");
  });

  it("returns empty for unparsable timestamps", () => {
    expect(staleness("not-a-date", now)).toBe("");
    expect(staleness("", now)).toBe("");
  });
});

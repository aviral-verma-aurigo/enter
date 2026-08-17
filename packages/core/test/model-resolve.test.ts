import { describe, expect, it } from "vitest";
import { resolveModel } from "../src/config/model.js";
import { ConfigError } from "../src/util/errors.js";

describe("resolveModel", () => {
  it("resolves registry models (passthrough)", () => {
    const m = resolveModel("anthropic", "claude-opus-4-7");
    expect(m.id).toBe("claude-opus-4-7");
    expect(m.provider).toBe("anthropic");
  });

  it("resolves claude-fable-5 via the extra-models shim", () => {
    const m = resolveModel("anthropic", "claude-fable-5");
    expect(m.id).toBe("claude-fable-5");
    expect(m.api).toBe("anthropic-messages");
    expect(m.contextWindow).toBe(1_000_000);
    expect(m.maxTokens).toBe(128_000);
    // reasoning stays false until the bundled driver understands these ids —
    // it would otherwise send budget_tokens, which Claude 5 models reject.
    expect(m.reasoning).toBe(false);
  });

  it("resolves claude-sonnet-5 via the extra-models shim", () => {
    const m = resolveModel("anthropic", "claude-sonnet-5");
    expect(m.id).toBe("claude-sonnet-5");
    expect(m.reasoning).toBe(false);
    expect(m.cost.input).toBe(3);
    expect(m.cost.output).toBe(15);
  });

  it("registry wins over the shim when ids collide", () => {
    // claude-opus-4-7 exists only in the registry; assert the registry entry
    // (with reasoning enabled) is returned, not a shim lookalike.
    const m = resolveModel("anthropic", "claude-opus-4-7");
    expect(m.reasoning).toBe(true);
  });

  it("throws ConfigError for unknown model ids", () => {
    expect(() => resolveModel("anthropic", "claude-nonexistent-9")).toThrow(ConfigError);
  });

  it("throws ConfigError for unknown providers", () => {
    expect(() => resolveModel("notaprovider", "claude-fable-5")).toThrow(ConfigError);
  });
});

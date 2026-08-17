import { getModel, type Model } from "@earendil-works/pi-ai";
import { ConfigError } from "../util/errors.js";

/**
 * Models newer than the bundled runtime's registry. Entries here are checked
 * after the registry, so a runtime upgrade that adds these ids wins.
 *
 * `reasoning: false` on the Claude 5 entries is deliberate: the bundled
 * Anthropic driver only emits adaptive thinking for 4.6/4.7-era ids and would
 * fall back to `budget_tokens` for anything else, which these models reject
 * with a 400. Omitting the `thinking` param is the correct request shape —
 * Fable 5 always thinks server-side, and Sonnet 5 defaults to adaptive.
 */
const EXTRA_MODELS: Record<string, Record<string, Model<any>>> = {
  anthropic: {
    "claude-fable-5": {
      id: "claude-fable-5",
      name: "Claude Fable 5",
      api: "anthropic-messages",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    } as Model<any>,
    "claude-sonnet-5": {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      api: "anthropic-messages",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    } as Model<any>,
  },
};

/**
 * Resolve a Model from dynamic string inputs.
 * The runtime's `getModel` is overloaded with strict provider/model unions; we bypass them
 * for runtime values that come from config/env/CLI. Unknown ids return undefined from
 * the registry, so fall back to EXTRA_MODELS and throw when neither knows the id.
 */
export function resolveModel(provider: string, modelId: string): Model<any> {
  let model: Model<any> | undefined;
  try {
    model = (getModel as unknown as (p: string, m: string) => Model<any> | undefined)(
      provider,
      modelId,
    );
  } catch {
    model = undefined;
  }
  model ??= EXTRA_MODELS[provider]?.[modelId];
  if (!model) {
    throw new ConfigError(
      `Could not resolve model '${provider}/${modelId}'. Check spelling — see the bundled model registry.`,
    );
  }
  return model;
}

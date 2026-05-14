import { getModel, type Model } from "@earendil-works/pi-ai";
import { ConfigError } from "../util/errors.js";

/**
 * Resolve a Model from dynamic string inputs.
 * pi-ai's `getModel` is overloaded with strict provider/model unions; we bypass them
 * for runtime values that come from config/env/CLI.
 */
export function resolveModel(provider: string, modelId: string): Model<any> {
  try {
    return (getModel as unknown as (p: string, m: string) => Model<any>)(provider, modelId);
  } catch (err) {
    throw new ConfigError(
      `Could not resolve model '${provider}/${modelId}'. Check spelling — see pi-ai's MODELS registry.`,
      err,
    );
  }
}

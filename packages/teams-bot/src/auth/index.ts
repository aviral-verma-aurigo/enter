// GitHub App auth stays bot-local — the bot is the only place that opens PRs.
export { GitHubAppAuth, type GitHubAppConfig, parseRepoRef } from "./github-app.js";

// Aha! auth stays bot-local for now; lift into @enter/core when CLI needs Aha! tools.
export { AhaApiKeyAuth, type AhaApiKeyConfig } from "./aha-api-key.js";

// ADO + Confluence + their auth live in @enter/core (CLI + bot share them).
export {
  EntraServicePrincipalAuth,
  type EntraServicePrincipalConfig,
  type AdoAuthorizer,
  adoPatAuth,
  AtlassianTokenAuth,
  type AtlassianTokenConfig,
  type AtlassianAuthorizer,
} from "@enter/core";

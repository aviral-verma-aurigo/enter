// GitHub App auth stays bot-local — the bot is the only place that opens PRs.
export { GitHubAppAuth, type GitHubAppConfig, parseRepoRef } from "./github-app.js";

// ADO + Confluence + Aha! and their auth live in @enter/core (CLI + bot share them).
export {
  EntraServicePrincipalAuth,
  type EntraServicePrincipalConfig,
  type AdoAuthorizer,
  adoPatAuth,
  AtlassianTokenAuth,
  type AtlassianTokenConfig,
  type AtlassianAuthorizer,
  AhaApiKeyAuth,
  type AhaApiKeyConfig,
  type AhaAuthorizer,
} from "@enter/core";

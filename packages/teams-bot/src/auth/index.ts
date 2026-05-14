// GitHub App auth stays bot-local — the bot is the only place that opens PRs.
export { GitHubAppAuth, type GitHubAppConfig, parseRepoRef } from "./github-app.js";

// Atlassian + Aha! auth stays bot-local for now; lift into @enter/core when CLI
// needs to register Confluence/Aha! tools.
export { AtlassianTokenAuth, type AtlassianTokenConfig } from "./atlassian-token.js";
export { AhaApiKeyAuth, type AhaApiKeyConfig } from "./aha-api-key.js";

// ADO + Entra service principal live in @enter/core (CLI + bot share them).
export {
  EntraServicePrincipalAuth,
  type EntraServicePrincipalConfig,
  type AdoAuthorizer,
  adoPatAuth,
} from "@enter/core";

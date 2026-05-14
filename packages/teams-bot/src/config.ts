import fs from "node:fs";

export interface BotEnv {
  port: number;
  appId: string;
  appPassword: string;
  appTenantId: string | undefined;
  homeOverride: string | undefined;

  // GitHub App
  github: {
    appId: string;
    privateKey: string;
    installationId: number | undefined;
  } | null;

  // Azure DevOps (Entra ID service principal)
  ado: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    orgUrl: string;
  } | null;

  // Confluence Cloud (bot account + API token)
  confluence: {
    baseUrl: string;
    user: string;
    token: string;
  } | null;

  // Aha! (service-account API key)
  aha: {
    baseUrl: string;
    apiKey: string;
  } | null;

  // Operational
  worktreesRoot: string;
  auditDbPath: string;
  channelAllowlist: string[] | null;
  monthlyTokenBudgetPerChannel: number;
  defaultAllowedRepos: string[];
}

function readPrivateKey(): string | undefined {
  const path = process.env["GITHUB_APP_PRIVATE_KEY_PATH"];
  if (path && fs.existsSync(path)) {
    return fs.readFileSync(path, "utf8");
  }
  // Fallback: env var with PEM contents (newlines as \n escaped is fine — Octokit handles both).
  const inline = process.env["GITHUB_APP_PRIVATE_KEY"];
  if (inline && inline.length > 0) return inline.replace(/\\n/g, "\n");
  return undefined;
}

function parseAllowlist(): string[] | null {
  const raw = process.env["ENTER_BOT_CHANNEL_ALLOWLIST"];
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function loadBotEnv(): BotEnv {
  const githubAppId = process.env["GITHUB_APP_ID"] ?? "";
  const githubKey = readPrivateKey();
  const installationIdRaw = process.env["GITHUB_APP_INSTALLATION_ID"];

  const github =
    githubAppId.length > 0 && githubKey
      ? {
          appId: githubAppId,
          privateKey: githubKey,
          installationId: installationIdRaw ? Number(installationIdRaw) : undefined,
        }
      : null;

  const adoTenant = process.env["ADO_TENANT_ID"];
  const adoClient = process.env["ADO_CLIENT_ID"];
  const adoSecret = process.env["ADO_CLIENT_SECRET"];
  const adoOrg = process.env["ADO_ORG_URL"];
  const ado =
    adoTenant && adoClient && adoSecret && adoOrg
      ? { tenantId: adoTenant, clientId: adoClient, clientSecret: adoSecret, orgUrl: adoOrg }
      : null;

  const confluenceBase = process.env["CONFLUENCE_BASE_URL"];
  const confluenceUser = process.env["CONFLUENCE_USER"];
  const confluenceToken = process.env["CONFLUENCE_API_TOKEN"];
  const confluence =
    confluenceBase && confluenceUser && confluenceToken
      ? { baseUrl: confluenceBase, user: confluenceUser, token: confluenceToken }
      : null;

  const ahaBase = process.env["AHA_BASE_URL"];
  const ahaKey = process.env["AHA_API_KEY"];
  const aha = ahaBase && ahaKey ? { baseUrl: ahaBase, apiKey: ahaKey } : null;

  return {
    port: Number(process.env["PORT"] ?? 3978),
    appId: process.env["MicrosoftAppId"] ?? "",
    appPassword: process.env["MicrosoftAppPassword"] ?? "",
    appTenantId: process.env["MicrosoftAppTenantId"],
    homeOverride: process.env["ENTER_BOT_HOME"] ?? process.env["ENTER_HOME"],
    github,
    ado,
    confluence,
    aha,
    worktreesRoot: process.env["ENTER_BOT_WORKTREES"] ?? "/var/lib/enter-bot/worktrees",
    auditDbPath: process.env["ENTER_BOT_AUDIT_DB"] ?? "/var/lib/enter-bot/audit.db",
    channelAllowlist: parseAllowlist(),
    monthlyTokenBudgetPerChannel: Number(process.env["ENTER_BOT_MONTHLY_TOKEN_BUDGET"] ?? 1_000_000),
    defaultAllowedRepos: (process.env["ENTER_BOT_ALLOWED_REPOS"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

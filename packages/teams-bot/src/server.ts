#!/usr/bin/env node
import express from "express";
import { loadBotEnv } from "./config.js";
import { createAdapter } from "./adapter.js";
import { EnterBot } from "./bot.js";
import { WorktreeManager } from "./channels/worktree-mgr.js";
import { ChannelConfig } from "./channels/channel-config.js";
import { AuditLog } from "./obs/audit-log.js";
import {
  AhaApiKeyAuth,
  AtlassianTokenAuth,
  EntraServicePrincipalAuth,
  GitHubAppAuth,
} from "./auth/index.js";

async function main(): Promise<void> {
  const env = loadBotEnv();
  if (!env.appId || !env.appPassword) {
    process.stderr.write(
      "MicrosoftAppId / MicrosoftAppPassword not set. Bot Framework calls will fail; " +
        "register an app and export these env vars. Continuing for local healthz only.\n",
    );
  }
  if (!env.github) {
    process.stderr.write(
      "GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY(_PATH) not set. " +
        "Bot can't clone repos or open PRs — only read-only/memory tools available.\n",
    );
  }
  if (!env.ado) {
    process.stderr.write(
      "ADO_TENANT_ID / ADO_CLIENT_ID / ADO_CLIENT_SECRET / ADO_ORG_URL not all set. " +
        "ADO tools (work-item read/comment/link) disabled.\n",
    );
  }
  if (!env.confluence) {
    process.stderr.write(
      "CONFLUENCE_BASE_URL / CONFLUENCE_USER / CONFLUENCE_API_TOKEN not all set. " +
        "Confluence tools disabled.\n",
    );
  }
  if (!env.aha) {
    process.stderr.write(
      "AHA_BASE_URL / AHA_API_KEY not all set. Aha! tools disabled.\n",
    );
  }

  const adapter = createAdapter({
    appId: env.appId,
    appPassword: env.appPassword,
    appTenantId: env.appTenantId,
  });

  const worktrees = new WorktreeManager(env.worktreesRoot);
  const channelConfig = new ChannelConfig(env.channelAllowlist);
  const audit = new AuditLog(env.auditDbPath);
  const auth = env.github ? new GitHubAppAuth(env.github) : null;
  const adoAuth = env.ado ? new EntraServicePrincipalAuth(env.ado) : null;
  const confluenceAuth = env.confluence ? new AtlassianTokenAuth(env.confluence) : null;
  const ahaAuth = env.aha ? new AhaApiKeyAuth(env.aha) : null;

  // Sweep stale worktrees every hour.
  const sweepTimer = setInterval(() => {
    void worktrees.sweep().catch((err) => process.stderr.write(`[sweep] ${err.message}\n`));
  }, 60 * 60 * 1000);
  sweepTimer.unref?.();

  const bot = new EnterBot({
    homeOverride: env.homeOverride,
    worktrees,
    channelConfig,
    audit,
    auth,
    adoAuth,
    confluenceAuth,
    ahaAuth,
    ...(env.ado ? { adoOrgUrl: env.ado.orgUrl } : {}),
    ...(env.confluence ? { confluenceBaseUrl: env.confluence.baseUrl } : {}),
    monthlyTokenBudgetPerChannel: env.monthlyTokenBudgetPerChannel,
    allowedRepos: env.defaultAllowedRepos,
  });

  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      teams: env.appId ? "configured" : "missing",
      github: env.github ? "configured" : "missing",
      ado: env.ado ? "configured" : "missing",
      confluence: env.confluence ? "configured" : "missing",
      aha: env.aha ? "configured" : "missing",
      worktreesRoot: env.worktreesRoot,
      channelAllowlist: env.channelAllowlist ? `${env.channelAllowlist.length} channels` : "open",
    });
  });

  app.listen(env.port, () => {
    process.stdout.write(`enter-bot listening on :${env.port}\n`);
  });
}

main().catch((err) => {
  process.stderr.write(`enter-bot startup failed: ${(err as Error).message}\n`);
  process.exit(1);
});

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import {
  resolvePaths,
  ensureDirs,
  loadConfig,
  resolveApiKey,
  resolveModel,
  MemoryStore,
  GraphStore,
  buildAgent,
  DoneSignal,
  runAutonomous,
  exportSession,
  JsonlSessionRepo,
  logger,
  EntraServicePrincipalAuth,
  adoPatAuth,
  buildAdoTools,
  AtlassianTokenAuth,
  buildConfluenceTools,
  AhaApiKeyAuth,
  buildAhaTools,
  McpClientManager,
  AuthError,
  type AdoAuthorizer,
  type ToolContext,
} from "@enter/core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { parseArgs, helpText } from "./args.js";
import { promptApiKey, removeApiKey, listConfiguredProviders } from "./login.js";
import { runPrintMode } from "./modes/print.js";
import { runInteractiveMode } from "./modes/interactive.js";
import { runTuiMode } from "./modes/tui.js";
import type { SlashContext } from "./slash/index.js";

const PKG_VERSION = "0.1.0";

const PLAN_FIRST_DIRECTIVE =
  "[plan-first mode] Investigate read-only (read/grep/glob/recall), then call the " +
  "`propose_plan` tool with a numbered step list and exit. DO NOT call write, edit, " +
  "bash, or any other mutating tool. The user will review the saved plan and execute " +
  "it separately via `enter --execute-plan <path>`.";

function buildAutonomousGoal(args: { autonomous?: string; plan?: string; executePlan?: string }): string {
  if (args.plan) {
    return `${PLAN_FIRST_DIRECTIVE}\n\nGoal: ${args.plan}`;
  }
  if (args.executePlan) {
    const planBody = fs.readFileSync(args.executePlan, "utf8");
    return (
      `Execute the following plan that the user previously reviewed and approved.\n` +
      `Source: ${args.executePlan}\n\n${planBody}`
    );
  }
  return args.autonomous!;
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.command === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (args.command === "version") {
    process.stdout.write(`enter ${PKG_VERSION} (node ${process.version})\n`);
    return;
  }

  const paths = resolvePaths();
  ensureDirs(paths);

  if (args.command === "export") {
    if (!args.exportSessionId) {
      throw new Error("Usage: enter export <session-id>");
    }
    const repo = new JsonlSessionRepo(paths.sessionsDir);
    const result = exportSession(repo, args.exportSessionId, paths.exportsDir);
    process.stdout.write(`Exported:\n  ${result.markdownPath}\n  ${result.jsonlPath}\n`);
    return;
  }

  if (args.command === "login") {
    const cfg = loadConfig(paths, args.provider ? { provider: args.provider } : {});
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("`enter login` requires an interactive terminal. Set the env var directly in non-interactive contexts.");
    }
    await promptApiKey(cfg.provider, paths);
    const providers = listConfiguredProviders(paths);
    process.stdout.write(`Saved providers: ${providers.join(", ")}\n`);
    return;
  }

  if (args.command === "logout") {
    const cfg = loadConfig(paths, args.provider ? { provider: args.provider } : {});
    const result = removeApiKey(cfg.provider, paths);
    if (result.removed) {
      process.stdout.write(`Removed saved key for "${cfg.provider}".\n`);
    } else {
      process.stdout.write(`No saved key for "${cfg.provider}" — nothing to remove.\n`);
    }
    return;
  }

  const cliOverrides = {
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
  };
  const config = loadConfig(paths, cliOverrides);
  let apiKey: string;
  try {
    apiKey = resolveApiKey(config.provider, paths);
  } catch (err) {
    if (err instanceof AuthError && process.stdin.isTTY && process.stdout.isTTY) {
      process.stdout.write(`\nWelcome to Enter — let's get you set up.\n`);
      apiKey = await promptApiKey(config.provider, paths);
    } else {
      throw err;
    }
  }
  const model = resolveModel(config.provider, config.model);
  logger.debug("Resolved model", { provider: config.provider, model: config.model });

  const memory = MemoryStore.open(paths.memoryDbFile);
  const graph = GraphStore.attach(memory);

  const cwd = process.cwd();
  const projectHash = crypto.createHash("sha1").update(cwd).digest("hex").slice(0, 16);

  const ctx: ToolContext = {
    memory,
    graph,
    paths,
    cwd,
    projectHash,
    channelKey: null,
    userKey: null,
  };

  const repo = new JsonlSessionRepo(paths.sessionsDir);
  const sessionMeta = repo.create({
    cwd,
    ...(args.session ? { sessionId: args.session } : {}),
  });

  // Plan-first mode (`--plan`) and execute-plan mode (`--execute-plan`) both ride
  // the autonomous loop, so they need a DoneSignal too.
  const isAutonomous = Boolean(args.autonomous || args.plan || args.executePlan);
  const doneSignal = isAutonomous ? new DoneSignal() : undefined;

  // Optional integration tools registered when env vars are present.
  const extraTools: AgentTool[] = [];
  const adoOrgUrl = process.env["ADO_ORG_URL"];
  if (adoOrgUrl) {
    let adoAuth: AdoAuthorizer | null = null;
    if (process.env["ADO_PAT"]) {
      adoAuth = adoPatAuth(process.env["ADO_PAT"]);
      logger.debug("ADO auth: PAT");
    } else if (
      process.env["ADO_TENANT_ID"] &&
      process.env["ADO_CLIENT_ID"] &&
      process.env["ADO_CLIENT_SECRET"]
    ) {
      adoAuth = new EntraServicePrincipalAuth({
        tenantId: process.env["ADO_TENANT_ID"],
        clientId: process.env["ADO_CLIENT_ID"],
        clientSecret: process.env["ADO_CLIENT_SECRET"],
      });
      logger.debug("ADO auth: service principal");
    }
    if (adoAuth) {
      const requesterTag = `${os.userInfo().username}@cli`;
      extraTools.push(
        ...buildAdoTools({ auth: adoAuth, orgUrl: adoOrgUrl, requestedBy: () => requesterTag }),
      );
      logger.info("Registered ADO tools", { count: 7, orgUrl: adoOrgUrl });
    }
  }

  const confluenceBase = process.env["CONFLUENCE_BASE_URL"];
  const confluenceUser = process.env["CONFLUENCE_USER"];
  const confluenceToken = process.env["CONFLUENCE_API_TOKEN"];
  if (confluenceBase && confluenceUser && confluenceToken) {
    const auth = new AtlassianTokenAuth({
      baseUrl: confluenceBase,
      user: confluenceUser,
      token: confluenceToken,
    });
    const requesterTag = `${os.userInfo().username}@cli`;
    extraTools.push(
      ...buildConfluenceTools({ auth, baseUrl: confluenceBase, requestedBy: () => requesterTag }),
    );
    logger.info("Registered Confluence tools", { count: 3, baseUrl: confluenceBase });
  }

  const ahaBase = process.env["AHA_BASE_URL"];
  const ahaKey = process.env["AHA_API_KEY"];
  if (ahaBase && ahaKey) {
    const auth = new AhaApiKeyAuth({ baseUrl: ahaBase, apiKey: ahaKey });
    const requesterTag = `${os.userInfo().username}@cli`;
    extraTools.push(
      ...buildAhaTools({ auth, baseUrl: ahaBase, requestedBy: () => requesterTag }),
    );
    logger.info("Registered Aha! tools", { count: 3, baseUrl: ahaBase });
  }

  // External MCP servers configured under `mcpServers` in `config.json`. Each
  // server is spawned over stdio and its tools are namespaced `mcp_<server>_*`.
  const mcpManager = new McpClientManager();
  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    const mcpTools = await mcpManager.start(config.mcpServers);
    extraTools.push(...mcpTools);
  }

  const { agent } = buildAgent({
    ctx,
    paths,
    model,
    apiKey,
    thinkingLevel: config.thinkingLevel,
    thinkingBudgets: config.thinkingBudgets,
    ...(doneSignal ? { doneSignal } : {}),
    ...(args.soul ? { soulPath: args.soul } : {}),
    ...(extraTools.length > 0 ? { extraTools } : {}),
    sessionId: sessionMeta.sessionId,
    memoryNudge: {
      nudgeEveryNTurns: config.memory.nudgeEveryNTurns,
      compactionThresholdTokens: config.memory.compactionThresholdTokens,
    },
  });

  const detachRepo = repo.attachToAgent(sessionMeta.sessionId, (l) => agent.subscribe(l));
  const onSigint = () => {
    process.stderr.write("\n[SIGINT] aborting agent…\n");
    agent.abort();
  };
  process.on("SIGINT", onSigint);

  try {
    if (doneSignal && (args.autonomous || args.plan || args.executePlan)) {
      const goal = buildAutonomousGoal(args);
      const result = await runAutonomous(agent, goal, {
        doneSignal,
        maxTurns: config.autonomy.maxTurns,
        idleStallTurns: config.autonomy.idleStallTurns,
        wallClockMinutes: config.autonomy.wallClockMinutes,
      });
      const tail = result.payload
        ? `\n[done] ${result.payload.summary}` +
          (result.payload.artifacts ? `\n[artifacts] ${result.payload.artifacts.join(", ")}` : "")
        : `\n[stopped: ${result.stop.reason} after ${result.stop.turns} turn(s)]`;
      process.stdout.write(`${result.finalText.trim()}\n${tail}\n`);
    } else {
      const promptText =
        args.positional.length > 0 ? args.positional.join(" ") : args.print ? "" : null;
      if (args.print && promptText !== null) {
        await runPrintMode({ prompt: promptText, agent });
      } else if (promptText !== null && promptText.length > 0) {
        await runPrintMode({ prompt: promptText, agent });
      } else {
        const slashContext: SlashContext = {
          memory,
          graph,
          paths,
          sessionId: sessionMeta.sessionId,
          out: process.stdout,
        };
        const useTui = !args.simple && Boolean(process.stdout.isTTY);
        if (useTui) {
          await runTuiMode({
            agent,
            slashContext,
            modelLabel: `${config.provider}/${config.model}`,
            cwd,
            version: PKG_VERSION,
          });
        } else {
          await runInteractiveMode({ agent, slashContext });
        }
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    detachRepo();
    await mcpManager.stop();
    memory.close();
    process.stdout.write(`\n[session ${sessionMeta.sessionId}]\n`);
  }
}

import crypto from "node:crypto";
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
  type AdoAuthorizer,
  type ToolContext,
} from "@enter/core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { parseArgs, helpText } from "./args.js";
import { runPrintMode } from "./modes/print.js";
import { runInteractiveMode } from "./modes/interactive.js";
import { runTuiMode } from "./modes/tui.js";
import type { SlashContext } from "./slash/index.js";

const PKG_VERSION = "0.1.0";

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

  const cliOverrides = {
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
  };
  const config = loadConfig(paths, cliOverrides);
  const apiKey = resolveApiKey(config.provider, paths);
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
  };

  const repo = new JsonlSessionRepo(paths.sessionsDir);
  const sessionMeta = repo.create({
    cwd,
    ...(args.session ? { sessionId: args.session } : {}),
  });

  const doneSignal = args.autonomous ? new DoneSignal() : undefined;

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
    if (doneSignal && args.autonomous) {
      const result = await runAutonomous(agent, args.autonomous, {
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
    memory.close();
    process.stdout.write(`\n[session ${sessionMeta.sessionId}]\n`);
  }
}

import { ActivityHandler, type TurnContext } from "botbuilder";
import crypto from "node:crypto";
import {
  resolvePaths,
  ensureDirs,
  loadConfig,
  resolveApiKey,
  resolveModel,
  MemoryStore,
  GraphStore,
  buildAgent,
  JsonlSessionRepo,
  logger,
  type EnterPaths,
  type ToolContext,
} from "@enter/core";
import type { Agent, AgentTool } from "@earendil-works/pi-agent-core";
import { channelSessionKey } from "./channels/session-keys.js";
import type { WorktreeManager } from "./channels/worktree-mgr.js";
import type { ChannelConfig } from "./channels/channel-config.js";
import type { GitHubAppAuth } from "./auth/github-app.js";
import type { AuditLog } from "./obs/audit-log.js";
import { buildBotTools } from "./tools/index.js";
import { estimateTokens } from "@enter/core";

export interface EnterBotDeps {
  homeOverride: string | undefined;
  worktrees: WorktreeManager;
  channelConfig: ChannelConfig;
  audit: AuditLog;
  auth: GitHubAppAuth | null;
  adoAuth: import("@enter/core").EntraServicePrincipalAuth | null;
  confluenceAuth: import("@enter/core").AtlassianTokenAuth | null;
  ahaAuth: import("./auth/index.js").AhaApiKeyAuth | null;
  adoOrgUrl?: string;
  confluenceBaseUrl?: string;
  monthlyTokenBudgetPerChannel: number;
  allowedRepos: string[];
}

interface ChannelRuntime {
  agent: Agent;
  memory: MemoryStore;
  paths: EnterPaths;
  sessionId: string;
  channelKey: string;
  ctx: ToolContext;
  toolCatalog: () => AgentTool[];
}

const BOT_ALLOWED_TOOLS_CORE = [
  "recall",
  "remember",
  "link",
  "neighbors",
  "path",
  "entity_facts",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "web_fetch",
  "delegate_to_claude_code",
  "spawn_subagent",
  "author_skill",
];
const BOT_ALLOWED_TOOLS_EXTRA = [
  "sandboxed_bash",
  "run_tests",
  "git_clone",
  "git_push",
  "github_pr_open",
  "github_pr_comment",
  "ado_work_item_get",
  "ado_query",
  "ado_work_item_create",
  "ado_work_item_update",
  "ado_work_item_comment",
  "ado_work_item_link",
  "confluence_page_get",
  "confluence_search",
  "confluence_page_append_comment",
  "ado_work_item_link_pr",
];

export class EnterBot extends ActivityHandler {
  private readonly channels = new Map<string, ChannelRuntime>();

  constructor(private readonly deps: EnterBotDeps) {
    super();
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity({
            type: "message",
            text:
              "Hi, I'm Enter. Mention me in this channel with a coding question. " +
              "I work only in public channels and never merge PRs — humans review.",
          });
        }
      }
      await next();
    });
  }

  private getOrBuildChannel(context: TurnContext, channelKey: string, userTag: string): ChannelRuntime {
    const existing = this.channels.get(channelKey);
    if (existing) return existing;

    const paths = resolvePaths({ homeOverride: this.deps.homeOverride });
    ensureDirs(paths);
    const config = loadConfig(paths);
    const apiKey = resolveApiKey(config.provider, paths);
    const model = resolveModel(config.provider, config.model);

    const memory = MemoryStore.open(paths.memoryDbFile);
    const graph = GraphStore.attach(memory);

    const repo = new JsonlSessionRepo(paths.sessionsDir);
    const sessionId = channelKey.replace(/[\\/:*?"<>|]/g, "_");
    const meta = repo.create({ cwd: paths.home, sessionId });

    const projectHash = crypto.createHash("sha1").update(channelKey).digest("hex").slice(0, 16);

    const ctx: ToolContext = {
      memory,
      graph,
      paths,
      cwd: paths.home, // bumped to worktree path on git_clone
      projectHash,
      channelKey,
    };

    let tools: AgentTool[] = [];
    const botTools = buildBotTools({
      channelKey,
      worktrees: this.deps.worktrees,
      auth: this.deps.auth,
      adoAuth: this.deps.adoAuth,
      adoOrgUrl: this.deps.adoOrgUrl ?? null,
      confluenceAuth: this.deps.confluenceAuth,
      confluenceBaseUrl: this.deps.confluenceBaseUrl ?? null,
      requestedBy: () => userTag,
      allowedRepos: this.deps.allowedRepos,
      onCloned: (worktreePath) => {
        ctx.cwd = worktreePath;
        logger.info("Bumped ctx.cwd to worktree", { channelKey, worktreePath });
      },
    });

    const { agent, tools: built } = buildAgent({
      ctx,
      paths,
      model,
      apiKey,
      thinkingLevel: config.thinkingLevel,
      thinkingBudgets: config.thinkingBudgets,
      allowedTools: [...BOT_ALLOWED_TOOLS_CORE, ...BOT_ALLOWED_TOOLS_EXTRA],
      extraTools: botTools,
      includeBash: false,
      channelKey,
      sessionId: meta.sessionId,
      memoryNudge: {
        nudgeEveryNTurns: config.memory.nudgeEveryNTurns,
        compactionThresholdTokens: config.memory.compactionThresholdTokens,
      },
    });
    tools = built;

    repo.attachToAgent(meta.sessionId, (l) => agent.subscribe(l));

    const runtime: ChannelRuntime = {
      agent,
      memory,
      paths,
      sessionId: meta.sessionId,
      channelKey,
      ctx,
      toolCatalog: () => tools,
    };
    this.channels.set(channelKey, runtime);
    logger.info("Initialized channel runtime", { channelKey, sessionId: meta.sessionId });
    return runtime;
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    const text = (context.activity.text ?? "").trim();
    if (!text) return;

    const channelKey = channelSessionKey(context);
    if (!this.deps.channelConfig.isAllowed(channelKey)) {
      await context.sendActivity({
        type: "message",
        text:
          "This channel isn't on Enter's allowlist. Ask an admin to add it via `ENTER_BOT_CHANNEL_ALLOWLIST`.",
      });
      return;
    }

    // Budget gate (per-channel monthly).
    const budget = this.deps.audit.getMonthly(channelKey);
    if (budget.approxTokens >= this.deps.monthlyTokenBudgetPerChannel) {
      await context.sendActivity({
        type: "message",
        text:
          `This channel has hit its monthly Enter token budget (${budget.approxTokens.toLocaleString()} / ` +
          `${this.deps.monthlyTokenBudgetPerChannel.toLocaleString()}). Resets next month, or ask an admin to raise it.`,
      });
      return;
    }

    const user = context.activity.from;
    const userTag =
      `Requested by ${user?.name ?? "unknown"}` +
      (user?.aadObjectId ? ` (${user.aadObjectId})` : "") +
      ` in channel ${channelKey}`;

    const runtime = this.getOrBuildChannel(context, channelKey, userTag);

    let finalText = "";
    const toolNotes: { name: string; ok: boolean }[] = [];
    let approxTokensThisTurn = 0;

    const unsubscribe = runtime.agent.subscribe((event) => {
      if (event.type === "tool_execution_end") {
        toolNotes.push({ name: event.toolName, ok: !event.isError });
        this.deps.audit.append({
          timestamp: new Date().toISOString(),
          channelKey,
          userAadId: user?.aadObjectId ?? null,
          userName: user?.name ?? null,
          toolName: event.toolName,
          argsHash: "",
          ok: !event.isError,
          durationMs: 0,
          ...(event.isError ? { errorMessage: "tool returned error" } : {}),
        });
      }
      if (event.type === "message_end") {
        const msg = event.message;
        approxTokensThisTurn += estimateTokens([msg]);
        if (Array.isArray(msg.content)) {
          const parts: string[] = [];
          for (const block of msg.content) {
            if (block && (block as { type?: string }).type === "text") {
              parts.push(String((block as { text?: string }).text ?? ""));
            }
          }
          if (parts.length > 0) finalText = parts.join("");
        }
      }
    });

    try {
      await runtime.agent.prompt(text);
      await runtime.agent.waitForIdle();
      const toolsLine =
        toolNotes.length > 0
          ? "\n\n_tools: " +
            toolNotes.map((t) => `${t.name}${t.ok ? "" : " (error)"}`).join(", ") +
            "_"
          : "";
      const reply = (finalText || "(no response)") + toolsLine;
      await context.sendActivity({ type: "message", text: reply });
    } catch (err) {
      await context.sendActivity({
        type: "message",
        text: `Error: ${(err as Error).message}`,
      });
    } finally {
      unsubscribe();
      this.deps.audit.bumpTokens(channelKey, approxTokensThisTurn);
    }
  }
}

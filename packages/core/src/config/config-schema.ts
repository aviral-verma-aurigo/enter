import { Type, type Static } from "typebox";

export const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("minimal"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("xhigh"),
]);
export type ThinkingLevel = Static<typeof ThinkingLevelSchema>;

export const ThinkingBudgetsSchema = Type.Object({
  low: Type.Number(),
  medium: Type.Number(),
  high: Type.Number(),
});

export const AutonomySchema = Type.Object({
  maxTurns: Type.Integer({ minimum: 1, maximum: 1000 }),
  idleStallTurns: Type.Integer({ minimum: 1, maximum: 20 }),
  wallClockMinutes: Type.Integer({ minimum: 1, maximum: 600 }),
});

export const MemoryConfigSchema = Type.Object({
  nudgeEveryNTurns: Type.Integer({ minimum: 1, maximum: 50 }),
  recallDefaultK: Type.Integer({ minimum: 1, maximum: 20 }),
  compactionThresholdTokens: Type.Integer({ minimum: 1000 }),
});

export const SubagentConfigSchema = Type.Object({
  defaultTools: Type.Array(Type.String()),
  maxTurns: Type.Integer({ minimum: 1, maximum: 200 }),
  timeoutMinutes: Type.Integer({ minimum: 1, maximum: 120 }),
});

export const ToolsConfigSchema = Type.Object({
  bash: Type.Object({
    timeoutMs: Type.Integer({ minimum: 1000 }),
    shell: Type.Union([
      Type.Literal("auto"),
      Type.Literal("powershell"),
      Type.Literal("cmd"),
      Type.Literal("bash"),
    ]),
  }),
  webFetch: Type.Object({
    timeoutMs: Type.Integer({ minimum: 1000 }),
    maxBytes: Type.Integer({ minimum: 1024 }),
  }),
});

export const UiConfigSchema = Type.Object({
  color: Type.Boolean(),
  renderer: Type.Union([Type.Literal("rich"), Type.Literal("plain")]),
});

export const McpServerSchema = Type.Object({
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  description: Type.Optional(Type.String()),
});
export type McpServer = Static<typeof McpServerSchema>;

export const EnterConfigSchema = Type.Object({
  provider: Type.String(),
  model: Type.String(),
  thinkingLevel: ThinkingLevelSchema,
  thinkingBudgets: ThinkingBudgetsSchema,
  autonomy: AutonomySchema,
  memory: MemoryConfigSchema,
  subagent: SubagentConfigSchema,
  tools: ToolsConfigSchema,
  ui: UiConfigSchema,
  /** External MCP (Model Context Protocol) servers spawned at startup. */
  mcpServers: Type.Optional(Type.Record(Type.String(), McpServerSchema)),
});

export type EnterConfig = Static<typeof EnterConfigSchema>;

export const DEFAULT_CONFIG: EnterConfig = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  thinkingLevel: "medium",
  thinkingBudgets: { low: 1024, medium: 4096, high: 16384 },
  autonomy: { maxTurns: 50, idleStallTurns: 2, wallClockMinutes: 30 },
  memory: { nudgeEveryNTurns: 6, recallDefaultK: 5, compactionThresholdTokens: 80000 },
  subagent: {
    defaultTools: ["read", "glob", "grep", "bash", "web_fetch"],
    maxTurns: 20,
    timeoutMinutes: 5,
  },
  tools: {
    bash: { timeoutMs: 120_000, shell: "auto" },
    webFetch: { timeoutMs: 30_000, maxBytes: 1_048_576 },
  },
  ui: { color: true, renderer: "rich" },
  // mcpServers omitted by default — opt-in feature, off until configured.
};

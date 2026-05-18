import { Type, type Static } from "typebox";

export const McpServerConfigSchema = Type.Object({
  command: Type.String({
    minLength: 1,
    description: "Executable to spawn (e.g. `npx`, `python`, or an absolute path).",
  }),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  /**
   * Optional friendly description shown in tool listings. The SDK already returns
   * a description per tool — this lets the operator add a server-level note
   * (e.g. "Sentry incidents (read-only)") that appears in logs.
   */
  description: Type.Optional(Type.String()),
});

export type McpServerConfig = Static<typeof McpServerConfigSchema>;

export const McpServersConfigSchema = Type.Record(
  Type.String({ pattern: "^[a-z0-9][a-z0-9_-]*$" }),
  McpServerConfigSchema,
);

export type McpServersConfig = Static<typeof McpServersConfigSchema>;

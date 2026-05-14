import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { DoneSignal } from "../autonomous/done-signal.js";

const DoneParams = Type.Object({
  summary: Type.String({ minLength: 1, description: "One-paragraph summary of what was accomplished." }),
  artifacts: Type.Optional(Type.Array(Type.String(), { description: "List of files or URLs produced." })),
});

type Params = Static<typeof DoneParams>;

export function doneTool(signal: DoneSignal): AgentTool<typeof DoneParams> {
  return {
    name: "done",
    label: "Mark done",
    description:
      "Call this when the autonomous goal has been fully achieved. Provide a summary and the list of artifacts. The autonomous loop terminates after this tool runs.",
    parameters: DoneParams,
    execute: async (_id, params: Params) => {
      const payload = { summary: params.summary, ...(params.artifacts ? { artifacts: params.artifacts } : {}) };
      signal.fire(payload);
      return {
        content: [{ type: "text", text: "Goal marked complete." }],
        details: payload,
        terminate: true,
      };
    },
  };
}

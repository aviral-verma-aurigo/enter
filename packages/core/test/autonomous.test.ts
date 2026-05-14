import { describe, expect, it } from "vitest";
import { DoneSignal } from "../src/autonomous/done-signal.js";
import { runAutonomous } from "../src/autonomous/auto-loop.js";
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";

type TurnAction = (ctx: {
  emit: (e: AgentEvent) => Promise<void>;
  doneSignal: DoneSignal;
}) => Promise<void> | void;

/**
 * Minimal Agent stub. Each call to `prompt(...)` runs the next queued `TurnAction`
 * synchronously inside the promise — no setTimeout races. This lets each test
 * deterministically program the events the loop will see.
 */
function makeStubAgent(actions: TurnAction[], doneSignal: DoneSignal) {
  const promptCalls: string[] = [];
  let listeners: Array<(e: AgentEvent) => void | Promise<void>> = [];
  let abortCalls = 0;
  let idx = 0;

  const emit = async (e: AgentEvent) => {
    for (const l of listeners) await l(e);
  };

  const agent = {
    subscribe(l: (e: AgentEvent) => void | Promise<void>) {
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
    async prompt(text: unknown) {
      promptCalls.push(typeof text === "string" ? text : JSON.stringify(text));
      const action = actions[idx++];
      if (action) await action({ emit, doneSignal });
    },
    async waitForIdle() {
      // no-op
    },
    abort() {
      abortCalls++;
    },
  };

  return {
    agent: agent as unknown as Agent,
    promptCalls,
    get abortCalls() {
      return abortCalls;
    },
  };
}

function turnEnd(text: string, hadToolCalls: boolean): AgentEvent {
  return {
    type: "turn_end",
    message: {
      role: "assistant",
      content: hadToolCalls
        ? ([{ type: "toolCall", name: "foo", id: "t1", arguments: {} }] as unknown as never)
        : ([{ type: "text", text }] as unknown as never),
      timestamp: Date.now(),
    } as never,
    toolResults: [],
  } as unknown as AgentEvent;
}

describe("runAutonomous", () => {
  it("stops when the done signal fires", async () => {
    const doneSignal = new DoneSignal();
    const { agent, promptCalls } = makeStubAgent(
      [
        async ({ emit, doneSignal: ds }) => {
          await emit(turnEnd("doing", true));
          ds.fire({ summary: "all done" });
        },
      ],
      doneSignal,
    );
    const result = await runAutonomous(agent, "goal", { doneSignal, maxTurns: 10 });
    expect(result.stop.reason).toBe("done");
    expect(result.payload?.summary).toBe("all done");
    expect(promptCalls.length).toBe(1); // only the seed
    expect(promptCalls[0]).toContain("goal");
  });

  it("stops at max_turns", async () => {
    const doneSignal = new DoneSignal();
    const actions: TurnAction[] = Array.from({ length: 10 }, () => async ({ emit }) => {
      await emit(turnEnd("turn", true));
    });
    const { agent, promptCalls } = makeStubAgent(actions, doneSignal);
    const result = await runAutonomous(agent, "goal", { doneSignal, maxTurns: 3, idleStallTurns: 99 });
    expect(result.stop.reason).toBe("max_turns");
    expect(result.stop.turns).toBe(3);
    expect(promptCalls.length).toBe(3); // seed + 2 continues
  });

  it("stops on idle stall (consecutive turns without tool calls)", async () => {
    const doneSignal = new DoneSignal();
    const actions: TurnAction[] = [
      async ({ emit }) => {
        await emit(turnEnd("hello", false));
      },
      async ({ emit }) => {
        await emit(turnEnd("again", false));
      },
      async ({ emit }) => {
        await emit(turnEnd("never reached", false));
      },
    ];
    const { agent, promptCalls } = makeStubAgent(actions, doneSignal);
    const result = await runAutonomous(agent, "goal", {
      doneSignal,
      maxTurns: 50,
      idleStallTurns: 2,
    });
    expect(result.stop.reason).toBe("idle_stall");
    expect(promptCalls.length).toBe(2); // seed + 1 continue, then idle break
  });

  it("does not stall when turns include tool calls", async () => {
    const doneSignal = new DoneSignal();
    const actions: TurnAction[] = [
      async ({ emit }) => {
        await emit(turnEnd("with tool", true));
      },
      async ({ emit }) => {
        await emit(turnEnd("still tooling", true));
      },
      async ({ emit }) => {
        await emit(turnEnd("more tools", true));
      },
    ];
    const { agent } = makeStubAgent(actions, doneSignal);
    const result = await runAutonomous(agent, "goal", {
      doneSignal,
      maxTurns: 3,
      idleStallTurns: 1,
    });
    expect(result.stop.reason).toBe("max_turns");
  });
});

describe("DoneSignal", () => {
  it("starts unfired", () => {
    expect(new DoneSignal().fired).toBe(false);
  });
  it("fire sets payload and fired", () => {
    const s = new DoneSignal();
    s.fire({ summary: "ok", artifacts: ["a.md"] });
    expect(s.fired).toBe(true);
    expect(s.payload).toEqual({ summary: "ok", artifacts: ["a.md"] });
  });
  it("reset clears state", () => {
    const s = new DoneSignal();
    s.fire({ summary: "x" });
    s.reset();
    expect(s.fired).toBe(false);
    expect(s.payload).toBeNull();
  });
});

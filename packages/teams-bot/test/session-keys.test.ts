import { describe, expect, it } from "vitest";
import { channelSessionKey } from "../src/channels/session-keys.js";

function context(opts: {
  tenantId?: string;
  teamId?: string;
  channelId?: string;
}) {
  return {
    activity: {
      conversation: { id: opts.channelId ?? "conv-id" },
      channelData: {
        tenant: opts.tenantId ? { id: opts.tenantId } : undefined,
        team: opts.teamId ? { id: opts.teamId } : undefined,
      },
    },
  } as never;
}

describe("channelSessionKey", () => {
  it("composes tenant:team:channel", () => {
    const key = channelSessionKey(
      context({ tenantId: "t1", teamId: "T1", channelId: "C1" }),
    );
    expect(key).toBe("t1:T1:C1");
  });

  it("falls back to no-tenant when channelData missing tenant", () => {
    const key = channelSessionKey(context({ teamId: "T1", channelId: "C1" }));
    expect(key).toBe("no-tenant:T1:C1");
  });

  it("falls back to conversation.id when team missing", () => {
    const key = channelSessionKey(context({ tenantId: "t1", channelId: "C1" }));
    expect(key).toBe("t1:C1:C1");
  });

  it("is deterministic — same inputs produce the same key", () => {
    const a = channelSessionKey(context({ tenantId: "t", teamId: "T", channelId: "C" }));
    const b = channelSessionKey(context({ tenantId: "t", teamId: "T", channelId: "C" }));
    expect(a).toBe(b);
  });
});

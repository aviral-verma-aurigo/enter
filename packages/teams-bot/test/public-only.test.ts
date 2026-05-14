import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicOnlyMiddleware } from "../src/middleware/public-only.js";

interface FakeContext {
  activity: {
    type: string;
    conversation: { conversationType: string };
  };
  sent: Array<{ type: string; text: string }>;
}

function makeContext(conversationType: string, type = "message"): FakeContext {
  const sent: Array<{ type: string; text: string }> = [];
  return {
    activity: { type, conversation: { conversationType } },
    sent,
    // sendActivity is called via `context.sendActivity(...)` in the middleware
    sendActivity(activity: { type: string; text: string }) {
      sent.push(activity);
      return Promise.resolve(undefined);
    },
  } as unknown as FakeContext;
}

describe("publicOnlyMiddleware", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    delete process.env["ENTER_BOT_ALLOW_DM"];
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("refuses 1:1 personal conversations with a polite reply", async () => {
    const ctx = makeContext("personal");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]!.text.toLowerCase()).toContain("public");
  });

  it("does not reply to non-message activity types in personal chat (but still skips next)", async () => {
    const ctx = makeContext("personal", "conversationUpdate");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(ctx.sent).toHaveLength(0);
  });

  it("passes channel conversations through to next()", async () => {
    const ctx = makeContext("channel");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(ctx.sent).toHaveLength(0);
  });

  it("passes groupChat conversations through to next()", async () => {
    const ctx = makeContext("groupChat");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it("allows personal chat when ENTER_BOT_ALLOW_DM=1 (dev override)", async () => {
    process.env["ENTER_BOT_ALLOW_DM"] = "1";
    const ctx = makeContext("personal");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(ctx.sent).toHaveLength(0);
  });

  it("ALLOW_DM with any value other than '1' still refuses", async () => {
    process.env["ENTER_BOT_ALLOW_DM"] = "true";
    const ctx = makeContext("personal");
    let nextCalled = false;
    await publicOnlyMiddleware.onTurn(ctx as never, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
  });
});

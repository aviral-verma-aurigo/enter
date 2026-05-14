import { describe, expect, it, vi } from "vitest";
import { mentionRequiredMiddleware } from "../src/middleware/mention-required.js";

// The middleware dynamically imports botbuilder to call TurnContext.removeRecipientMention.
// Stub it so the strip path runs without the heavy botbuilder dependency.
vi.mock("botbuilder", () => ({
  TurnContext: {
    removeRecipientMention: (activity: { text?: string }) =>
      (activity.text ?? "").replace(/<at>[^<]+<\/at>\s*/g, ""),
  },
}));

function ctx(opts: {
  type?: string;
  conversationType?: string;
  text?: string;
  recipientId?: string;
  mentions?: Array<{ id: string }>;
}) {
  return {
    activity: {
      type: opts.type ?? "message",
      conversation: { conversationType: opts.conversationType ?? "channel" },
      text: opts.text ?? "",
      recipient: { id: opts.recipientId ?? "bot-id" },
      entities: opts.mentions?.map((m) => ({
        type: "mention",
        mentioned: { id: m.id },
      })),
    },
  } as never;
}

describe("mentionRequiredMiddleware", () => {
  it("non-message activities pass through unchanged", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(ctx({ type: "typing" }), async () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("personal conversations pass through (publicOnlyMiddleware handles the refusal)", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(
      ctx({ conversationType: "personal" }),
      async () => {
        called = true;
      },
    );
    expect(called).toBe(true);
  });

  it("drops channel messages with no mentions", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(ctx({ recipientId: "bot-1" }), async () => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("drops channel messages with mentions of other users", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(
      ctx({ recipientId: "bot-1", mentions: [{ id: "user-2" }] }),
      async () => {
        called = true;
      },
    );
    expect(called).toBe(false);
  });

  it("passes through when the bot is mentioned (exact id match)", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(
      ctx({
        recipientId: "bot-1",
        mentions: [{ id: "bot-1" }],
        text: "<at>Bot</at> hello",
      }),
      async () => {
        called = true;
      },
    );
    expect(called).toBe(true);
  });

  it("passes through when the bot's id is a suffix of the mentioned id (Teams 28:bot-1)", async () => {
    let called = false;
    await mentionRequiredMiddleware.onTurn(
      ctx({
        recipientId: "bot-1",
        mentions: [{ id: "28:bot-1" }],
        text: "<at>Bot</at> hello",
      }),
      async () => {
        called = true;
      },
    );
    expect(called).toBe(true);
  });

  it("strips the mention text before calling next", async () => {
    const c = ctx({
      recipientId: "bot-1",
      mentions: [{ id: "bot-1" }],
      text: "<at>Bot</at> hello there",
    });
    await mentionRequiredMiddleware.onTurn(c, async () => {});
    expect((c as { activity: { text: string } }).activity.text).toBe("hello there");
  });
});

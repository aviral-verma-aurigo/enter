import type { Middleware, TurnContext } from "botbuilder";

const REFUSAL =
  "Hi! I only work in public Teams channels — the whole point is that other people can watch and learn from how we work together. " +
  "Please mention me in a public channel instead.";

/**
 * Refuse direct messages (`conversationType === "personal"`). Public-only by design — every interaction stays where teammates can see it.
 */
export const publicOnlyMiddleware: Middleware = {
  async onTurn(context: TurnContext, next) {
    const allowDm = process.env["ENTER_BOT_ALLOW_DM"] === "1";
    if (!allowDm && context.activity.conversation?.conversationType === "personal") {
      if (context.activity.type === "message") {
        await context.sendActivity({ type: "message", text: REFUSAL });
      }
      return; // do NOT call next — agent never runs for DMs
    }
    await next();
  },
};

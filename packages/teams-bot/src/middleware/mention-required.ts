import type { Middleware, TurnContext } from "botbuilder";

/**
 * In channel conversations, the bot only acts when @-mentioned. The mention text is stripped
 * from `activity.text` before downstream handlers run, leaving just the user's message.
 */
export const mentionRequiredMiddleware: Middleware = {
  async onTurn(context: TurnContext, next) {
    const activity = context.activity;
    if (activity.type !== "message") {
      await next();
      return;
    }
    const conv = activity.conversation;
    if (conv?.conversationType === "personal") {
      // DMs reach here only when ENTER_BOT_ALLOW_DM=1 (dev/test). Skip mention requirement in that case.
      await next();
      return;
    }
    // Channel conversations: require a mention of the bot.
    const recipientId = activity.recipient?.id ?? "";
    const mentions = activity.entities?.filter((e) => e.type === "mention") ?? [];
    const botMentioned = mentions.some((m) => {
      const mentionedId = (m as unknown as { mentioned?: { id?: string } }).mentioned?.id ?? "";
      return mentionedId && recipientId && (mentionedId === recipientId || mentionedId.endsWith(recipientId));
    });
    if (!botMentioned) {
      return; // silently ignore
    }
    // Strip the mention from the visible text.
    const { TurnContext } = await import("botbuilder");
    const stripped = TurnContext.removeRecipientMention(activity);
    activity.text = (stripped ?? activity.text ?? "").trim();
    await next();
  },
};

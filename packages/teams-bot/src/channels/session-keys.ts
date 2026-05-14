import type { TurnContext } from "botbuilder";

/**
 * Compute the per-channel session id used as the agent's persistent identifier.
 * Format: `<tenant>:<teamId>:<channelId>` or fallback to conversation.id.
 */
export function channelSessionKey(context: TurnContext): string {
  const activity = context.activity;
  const conv = activity.conversation;
  const channelData = activity.channelData as { tenant?: { id?: string }; team?: { id?: string } } | undefined;
  const tenant = channelData?.tenant?.id ?? "no-tenant";
  const teamId = channelData?.team?.id ?? conv.id;
  const channelId = conv.id;
  return `${tenant}:${teamId}:${channelId}`;
}

/**
 * Channel-level access control. v0.1 supports a tenant-scoped allowlist read from env;
 * the future plan is a pinned config card per channel that admins can edit in-place.
 */
export class ChannelConfig {
  constructor(private readonly allowlist: string[] | null) {}

  /**
   * `allowlist` of null = open (any channel in the tenant can use the bot).
   * `allowlist` of a list = only those channelKeys may use the bot.
   */
  isAllowed(channelKey: string): boolean {
    if (this.allowlist === null) return true;
    return this.allowlist.includes(channelKey);
  }
}

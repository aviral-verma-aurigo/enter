export interface AtlassianTokenConfig {
  /** Confluence Cloud base URL, e.g. `"https://acme.atlassian.net/wiki"`. */
  baseUrl: string;
  /** Bot account email (owns the API token). */
  user: string;
  /** API token from id.atlassian.com → Manage account → Security → API tokens. */
  token: string;
}

/**
 * Anything a Confluence tool needs to authorize a single REST call.
 * Mirrors the `AdoAuthorizer` pattern.
 */
export interface AtlassianAuthorizer {
  getAuthHeader(): Promise<string>;
}

/**
 * Service-account auth for Confluence Cloud (and any Atlassian Cloud product).
 * Encoded as HTTP Basic. Atlassian Cloud REST accepts this indefinitely
 * for tokens that haven't been revoked — no refresh dance.
 */
export class AtlassianTokenAuth implements AtlassianAuthorizer {
  readonly basicHeader: string;

  constructor(public readonly config: AtlassianTokenConfig) {
    const encoded = Buffer.from(`${config.user}:${config.token}`, "utf8").toString("base64");
    this.basicHeader = `Basic ${encoded}`;
  }

  async getAuthHeader(): Promise<string> {
    return this.basicHeader;
  }

  /** Build a fully qualified URL against the configured base. */
  url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.config.baseUrl.replace(/\/$/, "")}/${pathOrUrl.replace(/^\//, "")}`;
  }
}

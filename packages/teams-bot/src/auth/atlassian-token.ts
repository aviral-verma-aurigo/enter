export interface AtlassianTokenConfig {
  /** e.g. `"https://acme.atlassian.net/wiki"` for Confluence Cloud. */
  baseUrl: string;
  /** Bot account email (the user that owns the API token). */
  user: string;
  /** API token from id.atlassian.com → Manage account → Security → API tokens. */
  token: string;
}

/**
 * Service-account auth for Confluence Cloud (and any Atlassian Cloud product).
 *
 * Bot account + API token. Encoded as HTTP Basic. Confluence Cloud REST accepts this
 * indefinitely for tokens that haven't been revoked — no refresh dance needed.
 */
export class AtlassianTokenAuth {
  readonly basicHeader: string;

  constructor(public readonly config: AtlassianTokenConfig) {
    const encoded = Buffer.from(`${config.user}:${config.token}`, "utf8").toString("base64");
    this.basicHeader = `Basic ${encoded}`;
  }

  /** Build a fully qualified URL against the configured base. */
  url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.config.baseUrl.replace(/\/$/, "")}/${pathOrUrl.replace(/^\//, "")}`;
  }

  /** Default headers for every Atlassian REST call. */
  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: this.basicHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extra,
    };
  }
}

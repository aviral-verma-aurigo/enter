export interface AhaApiKeyConfig {
  /** e.g. `"https://acme.aha.io"`. */
  baseUrl: string;
  /** Service-account API key from Aha! → Settings → Account → API. */
  apiKey: string;
}

/**
 * Anything an Aha! tool needs to authorize a single REST call. Mirrors the
 * `AdoAuthorizer` / `AtlassianAuthorizer` patterns so future auth modes
 * (e.g. OAuth) can drop in without changing the tools.
 */
export interface AhaAuthorizer {
  getAuthHeader(): Promise<string>;
}

/**
 * Service-account auth for Aha!. Single static API key, sent as a Bearer token
 * (Aha!'s REST API accepts `Authorization: Bearer <key>`). Tokens stay valid
 * until revoked — no refresh dance.
 */
export class AhaApiKeyAuth implements AhaAuthorizer {
  readonly bearerHeader: string;

  constructor(public readonly config: AhaApiKeyConfig) {
    this.bearerHeader = `Bearer ${config.apiKey}`;
  }

  async getAuthHeader(): Promise<string> {
    return this.bearerHeader;
  }

  url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.config.baseUrl.replace(/\/$/, "")}/${pathOrUrl.replace(/^\//, "")}`;
  }
}

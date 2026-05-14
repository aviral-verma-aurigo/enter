export interface AhaApiKeyConfig {
  /** e.g. `"https://acme.aha.io"`. */
  baseUrl: string;
  /** Service-account API key from Aha! → Settings → Account → API. */
  apiKey: string;
}

/**
 * Service-account auth for Aha!. Single static API key, sent as a Bearer token
 * (Aha!'s REST API also accepts `Authorization: Bearer <key>`).
 */
export class AhaApiKeyAuth {
  readonly bearerHeader: string;

  constructor(public readonly config: AhaApiKeyConfig) {
    this.bearerHeader = `Bearer ${config.apiKey}`;
  }

  url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.config.baseUrl.replace(/\/$/, "")}/${pathOrUrl.replace(/^\//, "")}`;
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: this.bearerHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extra,
    };
  }
}

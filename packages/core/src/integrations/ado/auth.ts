import { ClientSecretCredential, type AccessToken } from "@azure/identity";

export interface EntraServicePrincipalConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** ADO's well-known resource ID; default scope is `${ADO_RESOURCE_ID}/.default`. */
  adoResourceId?: string;
}

/** Microsoft-published Azure DevOps resource ID. Universal across tenants. */
const ADO_RESOURCE_ID = "499b84ac-1321-427f-aa17-267ca6975798";

/**
 * Service-principal authentication for Entra ID. Used to mint bearer tokens for ADO REST.
 *
 * One credential is created at startup; `getAdoBearer()` returns a short-lived token,
 * cached and refreshed automatically by `@azure/identity`. No per-user OAuth.
 */
export class EntraServicePrincipalAuth implements AdoAuthorizer {
  private readonly credential: ClientSecretCredential;
  private readonly scope: string;
  private cached?: { token: string; expiresOn: number };

  constructor(public readonly config: EntraServicePrincipalConfig) {
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    this.scope = `${config.adoResourceId ?? ADO_RESOURCE_ID}/.default`;
  }

  async getAdoBearer(): Promise<string> {
    if (this.cached && this.cached.expiresOn - Date.now() > 5 * 60 * 1000) {
      return this.cached.token;
    }
    const token: AccessToken | null = await this.credential.getToken(this.scope);
    if (!token) {
      throw new Error("Entra ID returned no token for the ADO scope. Check tenant/client/secret.");
    }
    this.cached = { token: token.token, expiresOn: token.expiresOnTimestamp };
    return token.token;
  }

  async getAuthHeader(): Promise<string> {
    return `Bearer ${await this.getAdoBearer()}`;
  }
}

/**
 * Anything an ADO tool needs to authorize a single REST call.
 * Implemented by `EntraServicePrincipalAuth` (production) and by ad-hoc PAT shims
 * used in verification harnesses.
 */
export interface AdoAuthorizer {
  getAuthHeader(): Promise<string>;
}

/**
 * Build an `AdoAuthorizer` from a Personal Access Token. Convenient for local CLI use;
 * not recommended for the bot (ties auth to one human's account).
 */
export function adoPatAuth(pat: string): AdoAuthorizer {
  const header = `Basic ${Buffer.from(`:${pat}`, "utf8").toString("base64")}`;
  return {
    async getAuthHeader() {
      return header;
    },
  };
}

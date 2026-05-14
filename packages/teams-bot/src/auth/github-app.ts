import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  /** If omitted, we ask Octokit to look up the installation for the repo. */
  installationId?: number;
}

interface RepoRef {
  owner: string;
  repo: string;
}

export class GitHubAppAuth {
  private readonly authStrategy;
  private readonly cachedTokens = new Map<string, { token: string; expiresAt: number }>();
  private cachedInstallationByRepo = new Map<string, number>();

  constructor(public readonly config: GitHubAppConfig) {
    this.authStrategy = createAppAuth({
      appId: config.appId,
      privateKey: config.privateKey,
    });
  }

  /**
   * Resolve a short-lived installation token for the given repo. Tokens last ~1h.
   * Uses an explicit `installationId` if provided, otherwise discovers it from the repo.
   */
  async tokenForRepo(repo: RepoRef): Promise<string> {
    const cacheKey = `${repo.owner}/${repo.repo}`;
    const cached = this.cachedTokens.get(cacheKey);
    if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
      return cached.token;
    }
    const installationId = this.config.installationId ?? (await this.discoverInstallationId(repo));
    const auth = await this.authStrategy({ type: "installation", installationId });
    const expiresAt = (auth as { expiresAt?: string }).expiresAt
      ? new Date((auth as { expiresAt: string }).expiresAt).getTime()
      : Date.now() + 50 * 60 * 1000;
    const token = (auth as { token: string }).token;
    this.cachedTokens.set(cacheKey, { token, expiresAt });
    return token;
  }

  /** Build an authenticated Octokit client for repo operations. */
  async octokitForRepo(repo: RepoRef): Promise<Octokit> {
    const token = await this.tokenForRepo(repo);
    return new Octokit({ auth: token });
  }

  private async discoverInstallationId(repo: RepoRef): Promise<number> {
    const cached = this.cachedInstallationByRepo.get(`${repo.owner}/${repo.repo}`);
    if (cached) return cached;
    // App JWT to call /repos/:owner/:repo/installation
    const appAuth = await this.authStrategy({ type: "app" });
    const jwt = (appAuth as { token: string }).token;
    const app = new Octokit({ auth: jwt });
    const { data } = await app.apps.getRepoInstallation({ owner: repo.owner, repo: repo.repo });
    this.cachedInstallationByRepo.set(`${repo.owner}/${repo.repo}`, data.id);
    return data.id;
  }
}

export function parseRepoRef(input: string): RepoRef {
  // Accept "owner/repo", "github.com/owner/repo", "https://github.com/owner/repo(.git)?"
  const cleaned = input.trim().replace(/\.git$/, "").replace(/^https?:\/\/(?:www\.)?github\.com\//, "").replace(/^github\.com\//, "");
  const parts = cleaned.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Could not parse repo reference: ${input}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

import Database, { type Database as DB } from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Logical grouping for a tool call. Inferred from the tool name by `inferIntegration`
 * — none of the tool factories tags itself, so the mapping lives here.
 */
export type Integration = "ado" | "confluence" | "aha" | "github" | "core";

export interface AuditEntry {
  timestamp: string;
  channelKey: string;
  userAadId: string | null;
  userName: string | null;
  toolName: string;
  integration: Integration;
  argsHash: string;
  ok: boolean;
  durationMs: number;
  errorMessage?: string;
}

export interface BudgetSnapshot {
  channelKey: string;
  yearMonth: string;
  approxTokens: number;
}

export interface IntegrationUsage {
  integration: Integration;
  calls: number;
  errors: number;
  totalDurationMs: number;
}

export interface UserActivity {
  userAadId: string | null;
  userName: string | null;
  prOpens: number;
  prReviews: number;
  totalToolCalls: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  user_aad_id TEXT,
  user_name TEXT,
  tool_name TEXT NOT NULL,
  integration TEXT NOT NULL DEFAULT 'core',
  args_hash TEXT NOT NULL,
  ok INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_channel ON audit(channel_key);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_integration ON audit(integration);

CREATE TABLE IF NOT EXISTS channel_budget (
  channel_key TEXT NOT NULL,
  year_month TEXT NOT NULL,
  approx_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_key, year_month)
);
`;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Classify a tool by its name prefix. The mapping is intentionally pattern-based — adding
 * a new ADO/Confluence/Aha! tool gets it categorized automatically.
 */
export function inferIntegration(toolName: string): Integration {
  if (toolName.startsWith("ado_")) return "ado";
  if (toolName.startsWith("confluence_")) return "confluence";
  if (toolName.startsWith("aha_")) return "aha";
  if (toolName.startsWith("git_") || toolName.startsWith("github_")) return "github";
  return "core";
}

/**
 * Stable hash of tool arguments for audit. Same args → same hash; never reversible
 * (so it's safe to keep alongside the audit row even if args contain sensitive text).
 */
export function hashArgs(args: unknown): string {
  let normalized: string;
  try {
    normalized = JSON.stringify(args ?? null);
  } catch {
    normalized = String(args);
  }
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

export class AuditLog {
  readonly db: DB;
  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    // Best-effort migration: if integration column is missing on an old DB, add it.
    this.maybeAddIntegrationColumn();
  }

  private maybeAddIntegrationColumn(): void {
    const cols = this.db.prepare(`PRAGMA table_info(audit)`).all() as Array<{ name: string }>;
    const hasIntegration = cols.some((c) => c.name === "integration");
    if (!hasIntegration) {
      this.db.exec(`ALTER TABLE audit ADD COLUMN integration TEXT NOT NULL DEFAULT 'core'`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_integration ON audit(integration)`);
    }
  }

  append(entry: AuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit (timestamp, channel_key, user_aad_id, user_name, tool_name, integration, args_hash, ok, duration_ms, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.timestamp,
        entry.channelKey,
        entry.userAadId,
        entry.userName,
        entry.toolName,
        entry.integration,
        entry.argsHash,
        entry.ok ? 1 : 0,
        entry.durationMs,
        entry.errorMessage ?? null,
      );
  }

  /** Increment the approximate-token counter for this channel for the current month. */
  bumpTokens(channelKey: string, tokens: number): BudgetSnapshot {
    const ym = currentYearMonth();
    this.db
      .prepare(
        `INSERT INTO channel_budget (channel_key, year_month, approx_tokens)
         VALUES (?, ?, ?)
         ON CONFLICT(channel_key, year_month)
         DO UPDATE SET approx_tokens = approx_tokens + excluded.approx_tokens`,
      )
      .run(channelKey, ym, tokens);
    const row = this.db
      .prepare<[string, string], { approx_tokens: number }>(
        `SELECT approx_tokens FROM channel_budget WHERE channel_key = ? AND year_month = ?`,
      )
      .get(channelKey, ym);
    return { channelKey, yearMonth: ym, approxTokens: row?.approx_tokens ?? 0 };
  }

  getMonthly(channelKey: string): BudgetSnapshot {
    const ym = currentYearMonth();
    const row = this.db
      .prepare<[string, string], { approx_tokens: number }>(
        `SELECT approx_tokens FROM channel_budget WHERE channel_key = ? AND year_month = ?`,
      )
      .get(channelKey, ym);
    return { channelKey, yearMonth: ym, approxTokens: row?.approx_tokens ?? 0 };
  }

  /**
   * Per-integration tool-call stats for a channel since the given timestamp.
   * If `sinceIso` is omitted, returns the all-time view.
   */
  integrationUsage(channelKey: string, sinceIso?: string): IntegrationUsage[] {
    const params: unknown[] = [channelKey];
    let where = "channel_key = ?";
    if (sinceIso) {
      where += " AND timestamp >= ?";
      params.push(sinceIso);
    }
    const rows = this.db
      .prepare(
        `SELECT integration,
                COUNT(*) AS calls,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errors,
                COALESCE(SUM(duration_ms), 0) AS total_ms
         FROM audit
         WHERE ${where}
         GROUP BY integration
         ORDER BY calls DESC`,
      )
      .all(...params) as Array<{
        integration: Integration;
        calls: number;
        errors: number;
        total_ms: number;
      }>;
    return rows.map((r) => ({
      integration: r.integration,
      calls: r.calls,
      errors: r.errors,
      totalDurationMs: r.total_ms,
    }));
  }

  /** All-channels rollup, for /healthz. */
  globalIntegrationUsage(sinceIso?: string): IntegrationUsage[] {
    const params: unknown[] = [];
    let where = "1=1";
    if (sinceIso) {
      where += " AND timestamp >= ?";
      params.push(sinceIso);
    }
    const rows = this.db
      .prepare(
        `SELECT integration,
                COUNT(*) AS calls,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errors,
                COALESCE(SUM(duration_ms), 0) AS total_ms
         FROM audit
         WHERE ${where}
         GROUP BY integration
         ORDER BY calls DESC`,
      )
      .all(...params) as Array<{
        integration: Integration;
        calls: number;
        errors: number;
        total_ms: number;
      }>;
    return rows.map((r) => ({
      integration: r.integration,
      calls: r.calls,
      errors: r.errors,
      totalDurationMs: r.total_ms,
    }));
  }

  /**
   * Per-user activity since the given timestamp. Counts PR opens, reviews,
   * and total tool calls — the inputs to "merge-rate per engineer" once merge
   * tracking via webhook lands.
   */
  userActivity(channelKey: string | null, sinceIso?: string): UserActivity[] {
    const params: unknown[] = [];
    const whereParts: string[] = [];
    if (channelKey !== null) {
      whereParts.push("channel_key = ?");
      params.push(channelKey);
    }
    if (sinceIso) {
      whereParts.push("timestamp >= ?");
      params.push(sinceIso);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT user_aad_id, user_name,
                SUM(CASE WHEN tool_name = 'github_pr_open' AND ok = 1 THEN 1 ELSE 0 END) AS pr_opens,
                SUM(CASE WHEN tool_name = 'github_pr_review' AND ok = 1 THEN 1 ELSE 0 END) AS pr_reviews,
                COUNT(*) AS total_calls
         FROM audit
         ${where}
         GROUP BY user_aad_id, user_name
         ORDER BY total_calls DESC`,
      )
      .all(...params) as Array<{
        user_aad_id: string | null;
        user_name: string | null;
        pr_opens: number;
        pr_reviews: number;
        total_calls: number;
      }>;
    return rows.map((r) => ({
      userAadId: r.user_aad_id,
      userName: r.user_name,
      prOpens: r.pr_opens,
      prReviews: r.pr_reviews,
      totalToolCalls: r.total_calls,
    }));
  }

  close(): void {
    this.db.close();
  }
}

import Database, { type Database as DB } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface AuditEntry {
  timestamp: string;
  channelKey: string;
  userAadId: string | null;
  userName: string | null;
  toolName: string;
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  user_aad_id TEXT,
  user_name TEXT,
  tool_name TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  ok INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_channel ON audit(channel_key);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(timestamp);

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

export class AuditLog {
  readonly db: DB;
  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  append(entry: AuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit (timestamp, channel_key, user_aad_id, user_name, tool_name, args_hash, ok, duration_ms, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.timestamp,
        entry.channelKey,
        entry.userAadId,
        entry.userName,
        entry.toolName,
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

  close(): void {
    this.db.close();
  }
}

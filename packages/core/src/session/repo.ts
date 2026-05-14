import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";

export interface SessionMetadata {
  sessionId: string;
  createdAt: string;
  cwd: string;
  parentSessionId?: string;
}

interface SessionHeaderRecord extends SessionMetadata {
  type: "session";
  version: 1;
}

interface MessageRecord {
  type: "message";
  timestamp: string;
  message: AgentMessage;
}

interface CustomRecord {
  type: "custom";
  timestamp: string;
  customType: string;
  data: unknown;
}

export type SessionRecord = SessionHeaderRecord | MessageRecord | CustomRecord;

export class JsonlSessionRepo {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private filePathFor(sessionId: string): string {
    return path.join(this.dir, `${sessionId}.jsonl`);
  }

  create(opts: { sessionId?: string; cwd: string; parentSessionId?: string }): SessionMetadata {
    const sessionId = opts.sessionId ?? ulid();
    const filePath = this.filePathFor(sessionId);
    if (fs.existsSync(filePath)) {
      // Resuming: don't overwrite.
      return { sessionId, createdAt: new Date().toISOString(), cwd: opts.cwd };
    }
    const header: SessionHeaderRecord = {
      type: "session",
      version: 1,
      sessionId,
      createdAt: new Date().toISOString(),
      cwd: opts.cwd,
      ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
    };
    fs.writeFileSync(filePath, JSON.stringify(header) + "\n", { encoding: "utf8" });
    return header;
  }

  appendMessage(sessionId: string, message: AgentMessage): void {
    const record: MessageRecord = {
      type: "message",
      timestamp: new Date().toISOString(),
      message,
    };
    fs.appendFileSync(this.filePathFor(sessionId), JSON.stringify(record) + "\n", "utf8");
  }

  appendCustom(sessionId: string, customType: string, data: unknown): void {
    const record: CustomRecord = {
      type: "custom",
      timestamp: new Date().toISOString(),
      customType,
      data,
    };
    fs.appendFileSync(this.filePathFor(sessionId), JSON.stringify(record) + "\n", "utf8");
  }

  list(): SessionMetadata[] {
    const out: SessionMetadata[] = [];
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const full = path.join(this.dir, file);
      try {
        const firstLine = fs.readFileSync(full, "utf8").split("\n")[0] ?? "";
        if (!firstLine) continue;
        const parsed = JSON.parse(firstLine) as SessionRecord;
        if (parsed.type === "session") {
          out.push({
            sessionId: parsed.sessionId,
            createdAt: parsed.createdAt,
            cwd: parsed.cwd,
            ...(parsed.parentSessionId ? { parentSessionId: parsed.parentSessionId } : {}),
          });
        }
      } catch {
        // ignore corrupt lines
      }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  load(sessionId: string): { metadata: SessionMetadata; records: SessionRecord[] } | null {
    const filePath = this.filePathFor(sessionId);
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf8");
    const records: SessionRecord[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as SessionRecord);
      } catch {
        // tolerate malformed lines
      }
    }
    const header = records.find((r) => r.type === "session") as SessionHeaderRecord | undefined;
    if (!header) return null;
    return {
      metadata: {
        sessionId: header.sessionId,
        createdAt: header.createdAt,
        cwd: header.cwd,
        ...(header.parentSessionId ? { parentSessionId: header.parentSessionId } : {}),
      },
      records,
    };
  }

  /**
   * Attach a session repo to an Agent: every `message_end` event appends the message to the JSONL.
   * Returns an unsubscribe function.
   */
  attachToAgent(
    sessionId: string,
    subscribe: (listener: (event: AgentEvent) => void | Promise<void>) => () => void,
  ): () => void {
    return subscribe((event) => {
      if (event.type === "message_end") {
        this.appendMessage(sessionId, event.message);
      }
    });
  }

  get path(): string {
    return this.dir;
  }

  pathOf(sessionId: string): string {
    return this.filePathFor(sessionId);
  }
}

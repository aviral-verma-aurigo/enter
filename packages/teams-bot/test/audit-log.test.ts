import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLog, hashArgs, inferIntegration, type AuditEntry } from "../src/obs/audit-log.js";

let tmpDir: string;
let audit: AuditLog;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-audit-"));
  audit = new AuditLog(path.join(tmpDir, "audit.db"));
});
afterEach(() => {
  audit.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    channelKey: "tenant:team:channel",
    userAadId: "aad-1",
    userName: "Alice",
    toolName: "recall",
    integration: "core",
    argsHash: "deadbeef",
    ok: true,
    durationMs: 12,
    ...overrides,
  };
}

describe("inferIntegration", () => {
  it("classifies ado_* tools as 'ado'", () => {
    expect(inferIntegration("ado_work_item_get")).toBe("ado");
    expect(inferIntegration("ado_query")).toBe("ado");
  });
  it("classifies confluence_* tools as 'confluence'", () => {
    expect(inferIntegration("confluence_page_get")).toBe("confluence");
  });
  it("classifies aha_* tools as 'aha'", () => {
    expect(inferIntegration("aha_feature_get")).toBe("aha");
  });
  it("classifies git_* and github_* as 'github'", () => {
    expect(inferIntegration("git_clone")).toBe("github");
    expect(inferIntegration("github_pr_open")).toBe("github");
  });
  it("everything else is 'core'", () => {
    expect(inferIntegration("recall")).toBe("core");
    expect(inferIntegration("sandboxed_bash")).toBe("core");
    expect(inferIntegration("read")).toBe("core");
  });
});

describe("hashArgs", () => {
  it("returns the same hash for the same input", () => {
    expect(hashArgs({ id: 1, project: "Foo" })).toBe(hashArgs({ id: 1, project: "Foo" }));
  });
  it("returns different hashes for different inputs", () => {
    expect(hashArgs({ id: 1 })).not.toBe(hashArgs({ id: 2 }));
  });
  it("is order-sensitive on object keys (JSON.stringify behavior)", () => {
    // Same logical args; the test documents the limitation rather than promising stability.
    const a = hashArgs({ a: 1, b: 2 });
    const b = hashArgs({ b: 2, a: 1 });
    // We don't assert equality — just that the function doesn't crash.
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });
  it("handles null/undefined/circular gracefully", () => {
    expect(hashArgs(null)).toMatch(/^[a-f0-9]{16}$/);
    expect(hashArgs(undefined)).toMatch(/^[a-f0-9]{16}$/);
    const circular: Record<string, unknown> = { a: 1 };
    circular["self"] = circular;
    expect(typeof hashArgs(circular)).toBe("string");
  });
});

describe("AuditLog", () => {
  it("persists the integration column", () => {
    audit.append(entry({ toolName: "ado_query", integration: "ado" }));
    audit.append(entry({ toolName: "recall", integration: "core" }));
    const usage = audit.integrationUsage("tenant:team:channel");
    expect(usage).toHaveLength(2);
    const ado = usage.find((u) => u.integration === "ado");
    const core = usage.find((u) => u.integration === "core");
    expect(ado?.calls).toBe(1);
    expect(core?.calls).toBe(1);
  });

  it("integrationUsage aggregates calls / errors / duration per integration", () => {
    audit.append(entry({ integration: "ado", durationMs: 100, ok: true }));
    audit.append(entry({ integration: "ado", durationMs: 200, ok: false }));
    audit.append(entry({ integration: "ado", durationMs: 50, ok: true }));
    audit.append(entry({ integration: "confluence", durationMs: 30, ok: true }));
    const usage = audit.integrationUsage("tenant:team:channel");
    const ado = usage.find((u) => u.integration === "ado")!;
    expect(ado.calls).toBe(3);
    expect(ado.errors).toBe(1);
    expect(ado.totalDurationMs).toBe(350);
    const conf = usage.find((u) => u.integration === "confluence")!;
    expect(conf.calls).toBe(1);
    expect(conf.errors).toBe(0);
  });

  it("integrationUsage filters by channelKey", () => {
    audit.append(entry({ channelKey: "ch-A", integration: "ado" }));
    audit.append(entry({ channelKey: "ch-B", integration: "ado" }));
    expect(audit.integrationUsage("ch-A").reduce((s, u) => s + u.calls, 0)).toBe(1);
    expect(audit.integrationUsage("ch-B").reduce((s, u) => s + u.calls, 0)).toBe(1);
  });

  it("integrationUsage with sinceIso filters older entries", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 1000).toISOString();
    const recent = new Date(now.getTime() - 1000).toISOString();
    audit.append(entry({ timestamp: old, integration: "ado" }));
    audit.append(entry({ timestamp: recent, integration: "ado" }));
    const within30s = audit.integrationUsage(
      "tenant:team:channel",
      new Date(now.getTime() - 30 * 1000).toISOString(),
    );
    expect(within30s[0]?.calls).toBe(1);
  });

  it("globalIntegrationUsage rolls up across channels", () => {
    audit.append(entry({ channelKey: "ch-A", integration: "ado", durationMs: 100 }));
    audit.append(entry({ channelKey: "ch-B", integration: "ado", durationMs: 200 }));
    audit.append(entry({ channelKey: "ch-A", integration: "core", durationMs: 50 }));
    const usage = audit.globalIntegrationUsage();
    const ado = usage.find((u) => u.integration === "ado")!;
    expect(ado.calls).toBe(2);
    expect(ado.totalDurationMs).toBe(300);
    const core = usage.find((u) => u.integration === "core")!;
    expect(core.calls).toBe(1);
  });

  it("tracks per-channel monthly token budget (bumpTokens, getMonthly)", () => {
    expect(audit.getMonthly("ch-1").approxTokens).toBe(0);
    audit.bumpTokens("ch-1", 1000);
    audit.bumpTokens("ch-1", 500);
    expect(audit.getMonthly("ch-1").approxTokens).toBe(1500);
    expect(audit.getMonthly("ch-2").approxTokens).toBe(0); // isolated per channel
  });
});

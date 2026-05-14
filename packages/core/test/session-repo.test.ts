import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonlSessionRepo } from "../src/session/repo.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-sess-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("JsonlSessionRepo", () => {
  it("create writes a session header as the first line", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    const meta = repo.create({ cwd: "/work", sessionId: "S1" });
    const file = repo.pathOf("S1");
    expect(fs.existsSync(file)).toBe(true);
    const first = fs.readFileSync(file, "utf8").split("\n")[0];
    const parsed = JSON.parse(first!);
    expect(parsed.type).toBe("session");
    expect(parsed.sessionId).toBe("S1");
    expect(parsed.cwd).toBe("/work");
    expect(meta.sessionId).toBe("S1");
  });

  it("create generates a ULID when sessionId is omitted", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    const meta = repo.create({ cwd: "/work" });
    expect(meta.sessionId).toMatch(/^[A-Z0-9]{26}$/);
  });

  it("create on existing session preserves the original header", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });
    const before = fs.readFileSync(repo.pathOf("S1"), "utf8");
    repo.create({ cwd: "/different", sessionId: "S1" });
    const after = fs.readFileSync(repo.pathOf("S1"), "utf8");
    expect(after).toBe(before);
  });

  it("appendMessage adds a JSON line", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });
    repo.appendMessage("S1", {
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    } as never);
    const lines = fs.readFileSync(repo.pathOf("S1"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const last = JSON.parse(lines[1]!);
    expect(last.type).toBe("message");
    expect(last.message.role).toBe("user");
  });

  it("appendCustom adds a custom-typed record", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });
    repo.appendCustom("S1", "stop_reason", { reason: "done", turns: 3 });
    const lines = fs.readFileSync(repo.pathOf("S1"), "utf8").trim().split("\n");
    const last = JSON.parse(lines[1]!);
    expect(last.type).toBe("custom");
    expect(last.customType).toBe("stop_reason");
    expect(last.data).toEqual({ reason: "done", turns: 3 });
  });

  it("load returns metadata + records, sorted by file order", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });
    repo.appendMessage("S1", { role: "user", content: "a", timestamp: 1 } as never);
    repo.appendMessage("S1", { role: "assistant", content: "b", timestamp: 2 } as never);
    const loaded = repo.load("S1");
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata.sessionId).toBe("S1");
    expect(loaded!.records.filter((r) => r.type === "message")).toHaveLength(2);
  });

  it("load returns null for unknown session", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    expect(repo.load("does-not-exist")).toBeNull();
  });

  it("load tolerates malformed lines", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });
    // Append a corrupt line directly.
    fs.appendFileSync(repo.pathOf("S1"), "not-json\n", "utf8");
    repo.appendMessage("S1", { role: "user", content: "after-corrupt", timestamp: 1 } as never);
    const loaded = repo.load("S1");
    expect(loaded).not.toBeNull();
    // Should still find the header + the well-formed message
    expect(loaded!.records.filter((r) => r.type === "message")).toHaveLength(1);
  });

  it("list returns metadata sorted by createdAt DESC", async () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "older" });
    await new Promise((r) => setTimeout(r, 10));
    repo.create({ cwd: "/work", sessionId: "newer" });
    const list = repo.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.sessionId).toBe("newer");
    expect(list[1]!.sessionId).toBe("older");
  });

  it("attachToAgent appends on message_end events", () => {
    const repo = new JsonlSessionRepo(tmpDir);
    repo.create({ cwd: "/work", sessionId: "S1" });

    let emit: ((event: { type: string; message: unknown }) => void) | null = null;
    const unsubscribe = repo.attachToAgent("S1", (listener) => {
      emit = (e) => listener(e as never);
      return () => {
        emit = null;
      };
    });

    emit!({
      type: "message_end",
      message: { role: "user", content: "live!", timestamp: 1 },
    });
    // Other event types are ignored
    emit!({
      type: "agent_start",
      message: { role: "user", content: "should be skipped", timestamp: 1 },
    });

    const lines = fs.readFileSync(repo.pathOf("S1"), "utf8").trim().split("\n");
    // header + 1 message
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).message.content).toBe("live!");
    unsubscribe();
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addSchedule,
  dueSchedules,
  isDue,
  loadSchedules,
  markRun,
  removeSchedule,
  saveSchedules,
  schedulesFilePath,
  validateCadence,
  type Schedule,
  type ScheduleFile,
} from "../src/schedules/schedule-store.js";

function mk(partial: Partial<Schedule> = {}): Schedule {
  return {
    name: "test-schedule",
    goal: "do the thing",
    cadence: { kind: "interval", everyMinutes: 60 },
    enabled: true,
    lastRun: null,
    ...partial,
  };
}

describe("schedule-store", () => {
  describe("load/save round-trip", () => {
    it("returns an empty file when missing and round-trips through disk", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-sched-"));
      const file = schedulesFilePath(dir);
      expect(loadSchedules(file)).toEqual({ version: 1, schedules: [] });

      const withOne = addSchedule(loadSchedules(file), mk());
      saveSchedules(file, withOne);
      expect(loadSchedules(file)).toEqual(withOne);
    });

    it("rejects an invalid file shape", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-sched-"));
      const file = path.join(dir, "schedules.json");
      fs.writeFileSync(file, JSON.stringify({ nope: true }), "utf8");
      expect(() => loadSchedules(file)).toThrow(/Invalid schedules file/);
    });
  });

  describe("add/remove", () => {
    const empty: ScheduleFile = { version: 1, schedules: [] };

    it("adds and rejects duplicates", () => {
      const one = addSchedule(empty, mk());
      expect(one.schedules).toHaveLength(1);
      expect(() => addSchedule(one, mk())).toThrow(/already exists/);
    });

    it("rejects non-kebab-case names", () => {
      expect(() => addSchedule(empty, mk({ name: "Bad Name" }))).toThrow(/kebab-case/);
    });

    it("removes by name and errors on unknown", () => {
      const one = addSchedule(empty, mk());
      expect(removeSchedule(one, "test-schedule").schedules).toHaveLength(0);
      expect(() => removeSchedule(one, "nope")).toThrow(/No schedule/);
    });
  });

  describe("cadence validation", () => {
    it.each([
      [{ kind: "interval", everyMinutes: 1 } as const, true],
      [{ kind: "interval", everyMinutes: 0 } as const, false],
      [{ kind: "daily", at: "07:30" } as const, true],
      [{ kind: "daily", at: "23:59" } as const, true],
      [{ kind: "daily", at: "24:00" } as const, false],
      [{ kind: "daily", at: "7:5" } as const, false],
      [{ kind: "daily", at: "noon" } as const, false],
    ])("validateCadence(%j) ok=%s", (cadence, ok) => {
      if (ok) expect(() => validateCadence(cadence)).not.toThrow();
      else expect(() => validateCadence(cadence)).toThrow();
    });
  });

  describe("isDue — interval", () => {
    const now = new Date("2026-11-24T12:00:00Z");

    it("is due when never run", () => {
      expect(isDue(mk(), now)).toBe(true);
    });

    it("is due when interval has elapsed, not before", () => {
      const s = mk({ lastRun: "2026-11-24T10:59:00Z" }); // 61 min ago
      expect(isDue(s, now)).toBe(true);
      const fresh = mk({ lastRun: "2026-11-24T11:30:00Z" }); // 30 min ago
      expect(isDue(fresh, now)).toBe(false);
    });
  });

  describe("isDue — daily", () => {
    // Use local-time construction to match setHours in the implementation.
    const slot = mk({ cadence: { kind: "daily", at: "09:00" } });

    it("not due before today's slot", () => {
      const now = new Date(2026, 10, 24, 8, 0, 0);
      expect(isDue(slot, now)).toBe(false);
    });

    it("due after slot when never run", () => {
      const now = new Date(2026, 10, 24, 9, 30, 0);
      expect(isDue(slot, now)).toBe(true);
    });

    it("not due again after running past today's slot", () => {
      const now = new Date(2026, 10, 24, 10, 0, 0);
      const ran = mk({
        cadence: { kind: "daily", at: "09:00" },
        lastRun: new Date(2026, 10, 24, 9, 5, 0).toISOString(),
      });
      expect(isDue(ran, now)).toBe(false);
    });

    it("due the next day after yesterday's run", () => {
      const now = new Date(2026, 10, 25, 9, 30, 0);
      const ran = mk({
        cadence: { kind: "daily", at: "09:00" },
        lastRun: new Date(2026, 10, 24, 9, 5, 0).toISOString(),
      });
      expect(isDue(ran, now)).toBe(true);
    });
  });

  describe("dueSchedules + markRun", () => {
    it("filters disabled schedules and updates lastRun", () => {
      const now = new Date("2026-11-24T12:00:00Z");
      let file: ScheduleFile = { version: 1, schedules: [] };
      file = addSchedule(file, mk({ name: "a" }));
      file = addSchedule(file, mk({ name: "b", enabled: false }));
      expect(dueSchedules(file, now).map((s) => s.name)).toEqual(["a"]);

      file = markRun(file, "a", now);
      expect(file.schedules.find((s) => s.name === "a")!.lastRun).toBe(now.toISOString());
      expect(dueSchedules(file, now)).toHaveLength(0);
    });
  });
});

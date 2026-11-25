import fs from "node:fs";
import path from "node:path";

/**
 * Scheduled autonomous goals — the foundation for proactive background runs.
 *
 * Schedules live in `~/.enter/schedules.json`. Two cadence kinds are supported:
 *   - `{ kind: "interval", everyMinutes: N }` — due when N minutes have passed since lastRun.
 *   - `{ kind: "daily", at: "HH:MM" }` — due once per day after the given local time.
 *
 * There is no daemon: `enter schedule run-due` executes everything due and exits,
 * so the OS scheduler (cron / launchd / Task Scheduler) owns the clock.
 */

export type ScheduleCadence =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "daily"; at: string };

export interface Schedule {
  /** kebab-case unique name. */
  name: string;
  /** Autonomous goal text passed to the agent. */
  goal: string;
  cadence: ScheduleCadence;
  enabled: boolean;
  /** ISO timestamp of last successful run; null when never run. */
  lastRun: string | null;
  /** Cap on agent turns per run (safety). */
  maxTurns?: number;
}

export interface ScheduleFile {
  version: 1;
  schedules: Schedule[];
}

const EMPTY: ScheduleFile = { version: 1, schedules: [] };

export function schedulesFilePath(enterHome: string): string {
  return path.join(enterHome, "schedules.json");
}

export function loadSchedules(filePath: string): ScheduleFile {
  if (!fs.existsSync(filePath)) return structuredClone(EMPTY);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as ScheduleFile;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.schedules)) {
    throw new Error(`Invalid schedules file at ${filePath}`);
  }
  return parsed;
}

export function saveSchedules(filePath: string, file: ScheduleFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2) + "\n", "utf8");
}

export function addSchedule(file: ScheduleFile, schedule: Schedule): ScheduleFile {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(schedule.name)) {
    throw new Error(`Schedule name must be kebab-case: '${schedule.name}'`);
  }
  if (file.schedules.some((s) => s.name === schedule.name)) {
    throw new Error(`Schedule '${schedule.name}' already exists`);
  }
  validateCadence(schedule.cadence);
  return { ...file, schedules: [...file.schedules, schedule] };
}

export function removeSchedule(file: ScheduleFile, name: string): ScheduleFile {
  const next = file.schedules.filter((s) => s.name !== name);
  if (next.length === file.schedules.length) {
    throw new Error(`No schedule named '${name}'`);
  }
  return { ...file, schedules: next };
}

export function markRun(file: ScheduleFile, name: string, when: Date = new Date()): ScheduleFile {
  return {
    ...file,
    schedules: file.schedules.map((s) => (s.name === name ? { ...s, lastRun: when.toISOString() } : s)),
  };
}

/** All enabled schedules due at `now`. */
export function dueSchedules(file: ScheduleFile, now: Date = new Date()): Schedule[] {
  return file.schedules.filter((s) => s.enabled && isDue(s, now));
}

export function isDue(schedule: Schedule, now: Date = new Date()): boolean {
  const { cadence, lastRun } = schedule;
  if (cadence.kind === "interval") {
    if (!lastRun) return true;
    const elapsed = now.getTime() - Date.parse(lastRun);
    return elapsed >= cadence.everyMinutes * 60_000;
  }
  // daily
  const [hh, mm] = parseDailyAt(cadence.at);
  const todayAt = new Date(now);
  todayAt.setHours(hh, mm, 0, 0);
  if (now < todayAt) return false; // today's slot not reached yet
  if (!lastRun) return true;
  return Date.parse(lastRun) < todayAt.getTime(); // not yet run since today's slot
}

export function validateCadence(cadence: ScheduleCadence): void {
  if (cadence.kind === "interval") {
    if (!Number.isFinite(cadence.everyMinutes) || cadence.everyMinutes < 1) {
      throw new Error("interval cadence requires everyMinutes >= 1");
    }
    return;
  }
  parseDailyAt(cadence.at);
}

function parseDailyAt(at: string): [number, number] {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(at);
  if (!m) throw new Error(`daily cadence 'at' must be HH:MM (24h), got '${at}'`);
  return [Number(m[1]), Number(m[2])];
}

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function envLevel(): Level {
  const raw = (process.env["ENTER_LOG"] ?? "info").toLowerCase();
  return (LEVELS as Record<string, number>)[raw] !== undefined ? (raw as Level) : "info";
}

const current = envLevel();
const threshold = LEVELS[current];

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const line = fields
    ? `[${level}] ${msg} ${JSON.stringify(fields)}`
    : `[${level}] ${msg}`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stderr.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
  level: current,
};

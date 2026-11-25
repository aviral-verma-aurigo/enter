// Minimal ANSI helpers. We don't pull in chalk/kleur — keeps cold start fast.

const ESC = "[";
const RESET = `${ESC}0m`;

function wrap(open: number, close = 0): (s: string) => string {
  const closeCode = `${ESC}${close}m`;
  return (s) => `${ESC}${open}m${s}${closeCode === RESET ? RESET : closeCode + RESET}`;
}

export const color = {
  reset: RESET,
  dim: wrap(2, 22),
  bold: wrap(1, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  strikethrough: wrap(9, 29),

  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),

  bgBlue: wrap(44, 49),
  bgCyan: wrap(46, 49),
};

/**
 * Whether ANSI styling is on. Read on every call (not cached at import) so
 * `--no-color`, which is parsed after modules load, still takes effect for
 * styles built at module scope.
 */
export function colorEnabled(): boolean {
  return process.env["NO_COLOR"] === undefined && process.env["ENTER_NO_COLOR"] !== "1";
}

/**
 * Apply the `--no-color` flag. Sets `ENTER_NO_COLOR` for Enter's own output
 * and the standard `NO_COLOR` so tools Enter spawns (git, delegates, MCP
 * servers) also drop color.
 */
export function applyNoColorFlag(noColor: boolean): void {
  if (!noColor) return;
  process.env["ENTER_NO_COLOR"] = "1";
  process.env["NO_COLOR"] ??= "1";
}

export function colorize(fn: (s: string) => string): (s: string) => string {
  return (s) => (colorEnabled() ? fn(s) : s);
}

const TRUECOLOR =
  process.env["COLORTERM"] === "truecolor" || process.env["COLORTERM"] === "24bit";

function rgb(r: number, g: number, b: number, ansiFallback: (s: string) => string): (s: string) => string {
  if (!TRUECOLOR) return ansiFallback;
  const open = `${ESC}38;2;${r};${g};${b}m`;
  const close = `${ESC}39m`;
  return (s) => `${open}${s}${close}`;
}

export const brand = {
  slate: rgb(148, 163, 184, color.white),
};

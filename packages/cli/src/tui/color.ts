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

export const NO_COLOR = process.env["NO_COLOR"] !== undefined || process.env["ENTER_NO_COLOR"] === "1";

export function colorize(fn: (s: string) => string): (s: string) => string {
  return NO_COLOR ? (s) => s : fn;
}

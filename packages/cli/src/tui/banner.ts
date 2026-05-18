import os from "node:os";
import { brand, color, colorize } from "./color.js";

const C_BRAND = colorize((s: string) => color.bold(brand.slate(s)));
const C_DIM = colorize(color.dim);
const C_BOLD = colorize(color.bold);

const ART = [
  "███████╗███╗   ██╗████████╗███████╗██████╗ ",
  "██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗",
  "█████╗  ██╔██╗ ██║   ██║   █████╗  ██████╔╝",
  "██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗",
  "███████╗██║ ╚████║   ██║   ███████╗██║  ██║",
  "╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝",
];

const MIN_HERO_COLS = 47;

export interface BannerOptions {
  version: string;
  modelLabel: string;
  cwd: string;
}

export function renderBanner(opts: BannerOptions): string {
  const cols = process.stdout.columns ?? 80;
  const dir = shortenCwd(opts.cwd);

  if (cols < MIN_HERO_COLS) {
    return C_BOLD("Enter") + C_DIM(` · v${opts.version} · ${opts.modelLabel} · ${dir}`);
  }

  const rows = [
    ...ART.map(C_BRAND),
    " ",
    C_DIM("an autonomous teammate"),
    C_DIM(`v${opts.version}  ·  ${opts.modelLabel}  ·  ${dir}`),
    " ",
    `${C_DIM("tip:")} type a message — or ${C_BOLD("/help")} for commands · ${C_DIM("Ctrl+C twice to exit")}`,
  ];
  return rows.join("\n");
}

function shortenCwd(cwd: string): string {
  const home = os.homedir();
  let path = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
  path = path.replace(/\\/g, "/");
  if (path.length <= 40) return path;
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length <= 2) return path;
  const head = path.startsWith("~") ? "~" : segments[0] ? `/${segments[0]}` : "";
  const tail = segments.slice(-2).join("/");
  return `${head}/…/${tail}`;
}

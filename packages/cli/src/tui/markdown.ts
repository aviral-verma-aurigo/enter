import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { brand, color, colorize } from "./color.js";

/**
 * Terminal theme for assistant markdown. Every style goes through `colorize`,
 * so NO_COLOR / ENTER_NO_COLOR still get structured output (bullets, wrapped
 * paragraphs, boxed tables, indented code) without any styling escapes.
 */
export function markdownTheme(): MarkdownTheme {
  const bold = colorize(color.bold);
  const dim = colorize(color.dim);
  const italic = colorize(color.italic);
  const underline = colorize(color.underline);
  const slate = colorize(brand.slate);
  const cyan = colorize(color.cyan);
  const yellow = colorize(color.yellow);
  return {
    heading: (s) => bold(slate(s)),
    link: (s) => underline(cyan(s)),
    linkUrl: dim,
    code: yellow,
    codeBlock: (s) => s,
    codeBlockBorder: dim,
    quote: (s) => italic(dim(s)),
    quoteBorder: dim,
    hr: dim,
    listBullet: slate,
    bold,
    italic,
    strikethrough: colorize(color.strikethrough),
    underline,
  };
}

/** Render markdown to terminal lines that fit `width` columns. */
export function renderMarkdown(text: string, width: number): string[] {
  const md = new Markdown(text, 0, 0, markdownTheme());
  const lines = md.render(Math.max(10, width)).map((l) => l.replace(/ +$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Format final assistant text for a stdout stream. Rendered only when the
 * stream is a terminal; piped / redirected output keeps the raw markdown so
 * scripts and files get exactly what the model wrote.
 */
export function formatForStream(text: string, stream: { isTTY?: boolean; columns?: number }): string {
  if (stream.isTTY !== true) return text;
  return renderMarkdown(text, stream.columns ?? 80).join("\n");
}

/**
 * Incremental markdown writer for line-oriented output (the readline REPL).
 * Text is buffered and emitted one completed block at a time — at a blank
 * line outside a code fence — so output still appears progressively while
 * each block renders with full formatting. `flush()` emits the remainder.
 */
export class MarkdownStreamer {
  private buf = "";

  constructor(
    private readonly write: (s: string) => void,
    private readonly width: () => number,
  ) {}

  push(delta: string): void {
    this.buf += delta;
    const cut = lastSafeBreak(this.buf);
    if (cut <= 0) return;
    this.emit(this.buf.slice(0, cut));
    this.buf = this.buf.slice(cut);
  }

  flush(): void {
    if (this.buf.trim().length > 0) this.emit(this.buf);
    this.buf = "";
  }

  private emit(chunk: string): void {
    const lines = renderMarkdown(chunk, this.width());
    if (lines.length > 0) this.write(lines.join("\n") + "\n\n");
  }
}

/**
 * Index just past the last blank line ("\n\n") that is not inside a ``` / ~~~
 * fence, or -1 if there is none yet.
 */
function lastSafeBreak(text: string): number {
  let inFence = false;
  let best = -1;
  let lineStart = 0;
  while (lineStart < text.length) {
    const nl = text.indexOf("\n", lineStart);
    if (nl === -1) break;
    const line = text.slice(lineStart, nl);
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && line.trim() === "" && lineStart > 0) best = nl + 1;
    lineStart = nl + 1;
  }
  return best;
}

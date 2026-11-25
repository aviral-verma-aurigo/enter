import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MdModule = typeof import("../src/tui/markdown.js");
type TranscriptModule = typeof import("../src/tui/transcript.js");

const ESC = "\u001b[";
const SAMPLE = [
  "# Title",
  "",
  "Some **bold**, *italic*, `code` and [a link](https://example.com).",
  "",
  "- one",
  "- two",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
].join("\n");

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function load(noColor: boolean): Promise<MdModule & TranscriptModule> {
  if (noColor) process.env["NO_COLOR"] = "1";
  else delete process.env["NO_COLOR"];
  vi.resetModules();
  const md = await import("../src/tui/markdown.js");
  const tr = await import("../src/tui/transcript.js");
  return { ...md, ...tr };
}

describe("renderMarkdown", () => {
  const origNoColor = process.env["NO_COLOR"];
  const origEnterNoColor = process.env["ENTER_NO_COLOR"];
  beforeEach(() => delete process.env["ENTER_NO_COLOR"]);
  afterEach(() => {
    restoreEnv("NO_COLOR", origNoColor);
    restoreEnv("ENTER_NO_COLOR", origEnterNoColor);
    vi.resetModules();
  });

  it("strips markdown syntax and keeps structure", async () => {
    const { renderMarkdown } = await load(true);
    const out = renderMarkdown(SAMPLE, 60).join("\n");
    expect(out).not.toContain("**");
    expect(out).not.toContain("# Title");
    expect(out).not.toContain("`code`");
    expect(out).toContain("Title");
    expect(out).toContain("bold");
    expect(out).toContain("- one");
    expect(out).toContain("┌"); // table drawn as a box
    expect(out).not.toContain(ESC); // NO_COLOR => no escapes
  });

  it("applies ANSI styling when color is enabled", async () => {
    const { renderMarkdown } = await load(false);
    const out = renderMarkdown("some **bold** text", 40).join("\n");
    expect(out).toContain(`${ESC}1mbold`);
  });

  it("wraps to the given width and drops trailing padding", async () => {
    const { renderMarkdown } = await load(true);
    const lines = renderMarkdown("word ".repeat(40).trim(), 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(20);
      expect(l.endsWith(" ")).toBe(false);
    }
    expect(lines[lines.length - 1]).not.toBe("");
  });
});

describe("formatForStream", () => {
  const origNoColor = process.env["NO_COLOR"];
  afterEach(() => {
    restoreEnv("NO_COLOR", origNoColor);
    vi.resetModules();
  });

  it.each([
    { name: "piped stream keeps raw markdown", isTTY: false, raw: true },
    { name: "undefined isTTY keeps raw markdown", isTTY: undefined, raw: true },
    { name: "terminal renders markdown", isTTY: true, raw: false },
  ])("$name", async ({ isTTY, raw }) => {
    const { formatForStream } = await load(true);
    const out = formatForStream("**hi** there", { isTTY, columns: 40 });
    if (raw) expect(out).toBe("**hi** there");
    else expect(out).toBe("hi there");
  });
});

describe("MarkdownStreamer", () => {
  const origNoColor = process.env["NO_COLOR"];
  afterEach(() => {
    restoreEnv("NO_COLOR", origNoColor);
    vi.resetModules();
  });

  it("emits completed blocks progressively and the rest on flush", async () => {
    const { MarkdownStreamer } = await load(true);
    const writes: string[] = [];
    const s = new MarkdownStreamer((x) => writes.push(x), () => 40);
    s.push("First **para**");
    expect(writes).toHaveLength(0);
    s.push(" done.\n\nSecond");
    expect(writes).toEqual(["First para done.\n\n"]);
    s.push(" *para*");
    s.flush();
    expect(writes).toEqual(["First para done.\n\n", "Second para\n\n"]);
  });

  it("does not split inside a code fence", async () => {
    const { MarkdownStreamer } = await load(true);
    const writes: string[] = [];
    const s = new MarkdownStreamer((x) => writes.push(x), () => 40);
    s.push("```ts\nconst a = 1;\n\nconst b = 2;\n");
    expect(writes).toHaveLength(0);
    s.push("```\n\nafter");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("const a = 1;");
    expect(writes[0]).toContain("const b = 2;");
    s.flush();
    expect(writes[1]).toBe("after\n\n");
  });

  it("flush with only whitespace writes nothing", async () => {
    const { MarkdownStreamer } = await load(true);
    const writes: string[] = [];
    const s = new MarkdownStreamer((x) => writes.push(x), () => 40);
    s.push("\n\n  ");
    s.flush();
    expect(writes).toHaveLength(0);
  });
});

describe("Transcript assistant rendering", () => {
  const origNoColor = process.env["NO_COLOR"];
  afterEach(() => {
    restoreEnv("NO_COLOR", origNoColor);
    vi.resetModules();
  });

  it("renders assistant markdown inside the gutter", async () => {
    const { Transcript } = await load(true);
    const t = new Transcript();
    t.pushUser("hi");
    t.appendToAssistant("## Plan\n\n- **first**\n- second");
    t.endAssistant();
    const lines = t.render(40);
    const start = lines.findIndex((l) => l.startsWith("◆ "));
    expect(lines[start]).toBe("◆ Plan");
    expect(lines).toContain("  - first");
    expect(lines).toContain("  - second");
    expect(lines.join("\n")).not.toContain("**");
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(40);
  });

  it("re-renders as streamed deltas complete the syntax", async () => {
    const { Transcript } = await load(true);
    const t = new Transcript();
    t.appendToAssistant("**bo");
    expect(t.render(40)[0]).toContain("**bo");
    t.appendToAssistant("ld**");
    expect(t.render(40)[0]).toBe("◆ bold");
  });
});

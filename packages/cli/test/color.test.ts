import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyNoColorFlag, color, colorEnabled, colorize } from "../src/tui/color.js";
import { renderMarkdown } from "../src/tui/markdown.js";
import { parseArgs } from "../src/args.js";

const ESC = "\u001b[";

describe("color switches", () => {
  const orig = { NO_COLOR: process.env["NO_COLOR"], ENTER_NO_COLOR: process.env["ENTER_NO_COLOR"] };
  beforeEach(() => {
    delete process.env["NO_COLOR"];
    delete process.env["ENTER_NO_COLOR"];
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(orig)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it.each([
    { name: "no env set", env: {}, enabled: true },
    { name: "NO_COLOR=1", env: { NO_COLOR: "1" }, enabled: false },
    { name: "NO_COLOR empty string still disables", env: { NO_COLOR: "" }, enabled: false },
    { name: "ENTER_NO_COLOR=1", env: { ENTER_NO_COLOR: "1" }, enabled: false },
    { name: "ENTER_NO_COLOR=0 keeps color", env: { ENTER_NO_COLOR: "0" }, enabled: true },
  ])("colorEnabled: $name", ({ env, enabled }) => {
    Object.assign(process.env, env);
    expect(colorEnabled()).toBe(enabled);
  });

  it("styles built before the flag is applied still honor it", () => {
    const red = colorize(color.red); // built at "module load"
    expect(red("x")).toContain(ESC);
    applyNoColorFlag(true);
    expect(red("x")).toBe("x");
  });

  it("--no-color end to end: parsed flag strips markdown styling", () => {
    expect(renderMarkdown("**bold**", 40).join("")).toContain(ESC);
    applyNoColorFlag(parseArgs(["--no-color"]).noColor);
    expect(process.env["ENTER_NO_COLOR"]).toBe("1");
    expect(process.env["NO_COLOR"]).toBe("1");
    expect(renderMarkdown("**bold**", 40).join("")).toBe("bold");
  });

  it("does nothing when the flag is absent", () => {
    applyNoColorFlag(parseArgs([]).noColor);
    expect(process.env["ENTER_NO_COLOR"]).toBeUndefined();
    expect(process.env["NO_COLOR"]).toBeUndefined();
    expect(colorEnabled()).toBe(true);
  });

  it("keeps a NO_COLOR value the user already set", () => {
    process.env["NO_COLOR"] = "yes";
    applyNoColorFlag(true);
    expect(process.env["NO_COLOR"]).toBe("yes");
  });
});

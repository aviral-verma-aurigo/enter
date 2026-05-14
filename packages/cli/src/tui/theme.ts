import type { EditorTheme } from "@earendil-works/pi-tui";
import { color, colorize } from "./color.js";

export function editorTheme(): EditorTheme {
  return {
    borderColor: colorize(color.cyan),
    selectList: {
      selectedPrefix: colorize(color.cyan),
      selectedText: colorize(color.bold),
      description: colorize(color.dim),
      scrollInfo: colorize(color.dim),
      noMatch: colorize(color.dim),
    },
  };
}

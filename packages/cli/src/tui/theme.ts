import type { EditorTheme } from "@earendil-works/pi-tui";
import { brand, color, colorize } from "./color.js";

export function editorTheme(): EditorTheme {
  return {
    borderColor: colorize(brand.slate),
    selectList: {
      selectedPrefix: colorize(brand.slate),
      selectedText: colorize(color.bold),
      description: colorize(color.dim),
      scrollInfo: colorize(color.dim),
      noMatch: colorize(color.dim),
    },
  };
}

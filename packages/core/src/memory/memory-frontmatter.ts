import YAML from "yaml";

const DELIM = "---";

export interface FrontmatterDoc<T extends Record<string, unknown> = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

export function parseFrontmatter<T extends Record<string, unknown> = Record<string, unknown>>(
  source: string,
): FrontmatterDoc<T> {
  // Expect a leading `---` line.
  if (!source.startsWith(DELIM)) {
    return { frontmatter: {} as T, body: source };
  }
  const lines = source.split(/\r?\n/);
  // Find the closing delimiter, scanning from line 1.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === DELIM) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return { frontmatter: {} as T, body: source };
  }
  const yamlText = lines.slice(1, close).join("\n");
  const bodyText = lines.slice(close + 1).join("\n").replace(/^\r?\n/, "");
  const parsed = (yamlText.trim().length === 0 ? {} : YAML.parse(yamlText)) as T;
  return { frontmatter: parsed ?? ({} as T), body: bodyText };
}

export function stringifyFrontmatter<T extends Record<string, unknown>>(
  doc: FrontmatterDoc<T>,
): string {
  const fmText = YAML.stringify(doc.frontmatter, { lineWidth: 0 }).trimEnd();
  return `${DELIM}\n${fmText}\n${DELIM}\n${doc.body.startsWith("\n") ? "" : "\n"}${doc.body}`;
}

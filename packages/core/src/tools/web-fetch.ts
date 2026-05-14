import { request } from "undici";
import TurndownService from "turndown";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { ToolError } from "../util/errors.js";
import type { ToolContext } from "./context.js";

const WebFetchParams = Type.Object({
  url: Type.String({ description: "Absolute URL to fetch (http/https)." }),
  format: Type.Optional(
    Type.Union([Type.Literal("markdown"), Type.Literal("text"), Type.Literal("raw")]),
  ),
  max_bytes: Type.Optional(Type.Integer({ minimum: 1024, maximum: 10 * 1024 * 1024 })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120_000 })),
});

type Params = Static<typeof WebFetchParams>;

const td = new TurndownService({ headingStyle: "atx" });

export function webFetchTool(_ctx: ToolContext): AgentTool<typeof WebFetchParams> {
  return {
    name: "web_fetch",
    label: "Fetch web page",
    description: "Fetch a URL and return its content. HTML is converted to markdown by default.",
    parameters: WebFetchParams,
    execute: async (_id, params: Params, signal) => {
      const url = params.url;
      if (!/^https?:\/\//i.test(url)) {
        throw new ToolError(`Only http/https URLs are supported: ${url}`);
      }
      const maxBytes = params.max_bytes ?? 1_048_576;
      const timeoutMs = params.timeout_ms ?? 30_000;

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const onParentAbort = () => ac.abort();
      signal?.addEventListener("abort", onParentAbort, { once: true });

      try {
        const res = await request(url, { method: "GET", signal: ac.signal, maxRedirections: 5 });
        const ct = String(res.headers["content-type"] ?? "");
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of res.body) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buf.length;
          if (total > maxBytes) {
            chunks.push(buf.subarray(0, maxBytes - (total - buf.length)));
            break;
          }
          chunks.push(buf);
        }
        const body = Buffer.concat(chunks).toString("utf8");
        let rendered = body;
        const format = params.format ?? (ct.includes("html") ? "markdown" : "text");
        if (format === "markdown" && (ct.includes("html") || /^\s*</.test(body))) {
          rendered = td.turndown(body);
        }
        return {
          content: [
            {
              type: "text",
              text: `[${url}] status=${res.statusCode} type=${ct || "?"}\n\n${rendered}`,
            },
          ],
          details: {
            url,
            status: res.statusCode,
            contentType: ct,
            bytes: total,
            truncated: total > maxBytes,
            format,
          },
        };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onParentAbort);
      }
    },
  };
}

#!/usr/bin/env node
// Standalone ADO verification harness. Bypasses the agent loop — instantiates the
// auth + tools directly and calls them.
//
// Usage (from repo root):
//   node packages/teams-bot/verify-ado.mjs <work-item-id>
//   node packages/teams-bot/verify-ado.mjs <work-item-id> --query "SELECT ..."
//   node packages/teams-bot/verify-ado.mjs <work-item-id> --write --project <name>
//   node packages/teams-bot/verify-ado.mjs <work-item-id> --write --project <name> --pr-url <url>
//
// Auth — pick one:
//
//   FASTEST (30 seconds, no Azure admin needed):
//     Create a Personal Access Token at https://dev.azure.com/<org>/_usersSettings/tokens
//     with scopes: Work Items (Read & Write).
//     Set: ADO_PAT=<your-pat>
//          ADO_ORG_URL=https://dev.azure.com/<your-org>
//
//   PRODUCTION (Entra ID service principal — what the bot uses in prod):
//     Set: ADO_TENANT_ID, ADO_CLIENT_ID, ADO_CLIENT_SECRET, ADO_ORG_URL
//
// Without --write, only ado_work_item_get (and ado_query if --query given) run — read-only, safe.
// With --write, ado_work_item_comment fires against the provided work item (--project required).
// With --write --pr-url, ado_work_item_link_pr also fires.

import {
  EntraServicePrincipalAuth,
  adoWorkItemGetTool,
  adoWorkItemCommentTool,
  adoWorkItemLinkPrTool,
  adoQueryTool,
} from "@enter/core";

function arg(name, defaultValue) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return defaultValue;
  return process.argv[i + 1];
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const id = Number(process.argv[2]);
if (!id || Number.isNaN(id)) {
  console.error("Usage: node packages/teams-bot/verify-ado.mjs <work-item-id> [--query \"WIQL\"] [--write --project <name>] [--pr-url <url>]");
  console.error("Auth: ADO_PAT + ADO_ORG_URL  (fastest)");
  console.error("   or ADO_TENANT_ID + ADO_CLIENT_ID + ADO_CLIENT_SECRET + ADO_ORG_URL (service principal)");
  process.exit(2);
}

const orgUrl = process.env.ADO_ORG_URL;
if (!orgUrl) {
  console.error("Missing ADO_ORG_URL (e.g. https://dev.azure.com/your-org).");
  process.exit(3);
}

let auth;
let authMode;
if (process.env.ADO_PAT) {
  // PAT auth: HTTP Basic with empty username and the PAT as the password.
  const encoded = Buffer.from(`:${process.env.ADO_PAT}`, "utf8").toString("base64");
  auth = { getAuthHeader: async () => `Basic ${encoded}` };
  authMode = "PAT";
} else {
  const required = ["ADO_TENANT_ID", "ADO_CLIENT_ID", "ADO_CLIENT_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`No ADO_PAT and missing service-principal vars: ${missing.join(", ")}`);
    console.error("Set ADO_PAT for the fast path, or all four service-principal vars for production-equivalent auth.");
    process.exit(3);
  }
  auth = new EntraServicePrincipalAuth({
    tenantId: process.env.ADO_TENANT_ID,
    clientId: process.env.ADO_CLIENT_ID,
    clientSecret: process.env.ADO_CLIENT_SECRET,
  });
  authMode = "ServicePrincipal";
}

const opts = { auth, orgUrl, requestedBy: () => "verify-ado.mjs" };

function header(label) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 70 - label.length - 4))}`);
}

async function run() {
  header(`Auth (mode=${authMode})`);
  try {
    const h = await auth.getAuthHeader();
    console.log(`Authorization header acquired (${h.split(" ")[0]}, ${h.length} chars).`);
  } catch (err) {
    console.error(`Auth FAILED: ${err.message}`);
    process.exit(4);
  }

  header(`ado_work_item_get (id=${id})`);
  const get = adoWorkItemGetTool(opts);
  const r1 = await get.execute("verify-get", { id });
  console.log(`isError: ${r1.isError ? "true" : "false"}`);
  console.log(r1.content[0]?.text ?? "(no content)");

  const wiql = arg("query");
  if (wiql) {
    header(`ado_query`);
    const q = adoQueryTool(opts);
    const r2 = await q.execute("verify-query", { wiql, limit: 10 });
    console.log(`isError: ${r2.isError ? "true" : "false"}`);
    console.log(r2.content[0]?.text ?? "(no content)");
  }

  if (flag("write")) {
    const project = arg("project");
    if (!project) {
      console.error("--write requires --project <name>");
      process.exit(5);
    }
    header(`ado_work_item_comment (PROJECT=${project}, id=${id})`);
    const c = adoWorkItemCommentTool(opts);
    const r3 = await c.execute("verify-comment", {
      id,
      project,
      body: `[verify-ado.mjs] Test comment at ${new Date().toISOString()}. This is a smoke test.`,
    });
    console.log(`isError: ${r3.isError ? "true" : "false"}`);
    console.log(r3.content[0]?.text ?? "(no content)");

    const prUrl = arg("pr-url");
    if (prUrl) {
      header(`ado_work_item_link_pr (id=${id}, pr=${prUrl})`);
      const l = adoWorkItemLinkPrTool(opts);
      const r4 = await l.execute("verify-link", {
        id,
        pr_url: prUrl,
        comment: "verify-ado.mjs smoke test",
      });
      console.log(`isError: ${r4.isError ? "true" : "false"}`);
      console.log(r4.content[0]?.text ?? "(no content)");
    }
  }

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(`\nUnhandled error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

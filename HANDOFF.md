# Handoff — getting `enter-bot` live in Microsoft Teams

> Working doc for whoever (human or agent) continues this. Goal: take the
> `@enter/teams-bot` package from "code-complete, builds, boots locally" to
> "live in a Teams channel, opening GitHub pull requests." Read `CLAUDE.md`
> first — its rules (docs+tests alongside code, naming hygiene, bot security
> guarantees) are hard constraints.

## Context

`enter` is an autonomous teammate that turns conversations into pull requests.
Two surfaces over one runtime (`@enter/core`): the `enter` CLI and the
`enter-bot` Teams bot. The bot is a Bot Framework webhook (Express, listens on
`/api/messages`), runs as a **service account** (never per-user OAuth), is
**public-channels-only** (refuses DMs), **never merges PRs**, and enforces a
per-channel monthly token budget. Architecture lives in `@enter/core`; the bot
is a thin shell that scopes `ToolContext` by Teams channel + user and swaps
plain `bash` for `sandboxed_bash`.

Decisions already made with the user:
- **Repos are on GitHub** (not Azure DevOps) → the existing GitHub App path is
  correct; no ADO PR tooling needs building.
- **Hosting undecided** → the Dockerfile was built portable (runs on Azure App
  Service / Container Apps / Fargate / Cloud Run / on-prem).

## What was done this session (Phase 1 — repo scaffolding)

All committed to behavior-free deploy artifacts + docs. No `packages/*/src`
code was changed.

| File | What it is |
|---|---|
| `.env.example` (repo root) | Fill-in template of every env var the bot reads, with inline guidance. |
| `Dockerfile` (repo root) | Portable multi-stage build. Build stage compiles `core`+`bot`; runtime stage installs prod-only deps. Installs `python3 make g++ git` because `better-sqlite3` (in `@enter/core`) is a native module. Entry: `node packages/teams-bot/dist/server.js`, port `3978`, volume `/var/lib/enter-bot`. |
| `.dockerignore` (repo root) | Keeps `node_modules`/`dist`/`.env`/`.enter`/`packages/docs` out of build context. |
| `packages/teams-bot/teams-manifest/manifest.json` | Teams app definition. **Scopes are `team` + `groupchat` only — `personal`/DM scope intentionally omitted** to match the public-only guarantee. `id` and `bots[0].botId` are placeholders → set both to the Microsoft App ID. |
| `packages/teams-bot/teams-manifest/README.md` | How to add icons, fill in App ID, zip, and upload. |
| `packages/docs/.../deploy/teams-bot.md` | Updated to reference the real Dockerfile, `.env.example`, and manifest folder. |

### Verified working
- Bot boots with no creds and serves `/healthz` (degrades gracefully; logs
  which integrations are missing). Tested locally on port 3978.
- `manifest.json` is valid JSON.
- `npm run build:docs` passes.
- `npm test` → **250 tests / 28 files, all green.**

### How to re-verify locally (no credentials needed)
```sh
npm run build:core && npm run build:bot
mkdir -p /tmp/enter-bot/worktrees
ENTER_BOT_WORKTREES=/tmp/enter-bot/worktrees ENTER_BOT_AUDIT_DB=/tmp/enter-bot/audit.db \
  PORT=3978 node packages/teams-bot/dist/server.js &
# then, via node (curl may be blocked in some sandboxes):
node -e "fetch('http://localhost:3978/healthz').then(r=>r.json()).then(j=>console.log(j))"
```
Expect `status: ok` with every integration `missing` until `.env` is filled.

> NOTE: these Phase-1 files may be **uncommitted** at handoff time. Check
> `git status`. There were also two pre-existing uncommitted changes from
> before this session: `package-lock.json` and a small stderr-diagnostic add in
> `packages/cli/src/modes/print.ts`. Commit policy: branch off `main` first
> (don't commit straight to `main`), and end commit messages with the
> Co-Authored-By trailer per harness rules.

## Next steps

### Phase 2 — external accounts (needs portal access; cannot be done from the repo)

1. **GitHub App** — `https://github.com/organizations/<org>/settings/apps/new`
   - Permissions: **Contents** R/W, **Pull requests** R/W. Webhook **off**.
     Events **none**. Installable **only on this account**.
   - Generate + download the `.pem`. Note the **App ID**.
   - **Install App** → select the specific repos the bot may touch.
   - Fills `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY_PATH` (or
     `GITHUB_APP_PRIVATE_KEY` inline). Full guide:
     `packages/docs/src/content/docs/deploy/github-app.md`.
   - Lock down with `ENTER_BOT_ALLOWED_REPOS=org/a,org/b`.

2. **Azure Bot resource** — Azure Portal → create an **Azure Bot**.
   - Copy the **Microsoft App ID**; generate a **client secret**.
   - Channels → enable **Microsoft Teams**.
   - Messaging endpoint → set to the public HTTPS URL + `/api/messages`
     (the ngrok URL in Phase 3, or the deployed host later).
   - Fills `MicrosoftAppId` / `MicrosoftAppPassword` / `MicrosoftAppTenantId`.

### Phase 3 — see it live

1. Fill `.env` (copy from `.env.example`). `ANTHROPIC_API_KEY` is already in the
   developer's `~/.enter/keys.json` for CLI use, but the bot reads it from env —
   set it in `.env`.
2. `npm run dev:bot` (or `node packages/teams-bot/dist/server.js`).
3. `ngrok http 3978` → put the HTTPS URL + `/api/messages` into the Azure Bot
   messaging endpoint.
4. Package the manifest: set `id` + `botId` to the App ID, drop in
   `color.png` (192×192) and `outline.png` (32×32), `zip`, upload via Teams →
   Apps → Manage your apps → Upload a custom app. (Custom upload must be enabled
   in Teams admin settings.)
5. `@Enter` in a channel → it replies. Ask for a change → it should clone,
   branch, commit, push, and open a PR. It will refuse DMs.
6. Deploy: `docker build -t enter-bot .` → push to the chosen host, mount a
   persistent volume at `/var/lib/enter-bot` (losing the audit DB loses
   per-channel token-budget bookkeeping).

### Phase 4 — hardening before wider rollout (from `BACKLOG.md`)

- **Per-user rate limits** — today only a per-channel monthly token budget
  exists (`obs/audit-log.ts` `getMonthly`, enforced in `bot.ts`). Add per-user
  mentions/hour and PRs/day caps. The audit log already records per-user rows
  (`user_aad_id`), so the data is there. **Ships with tests + docs** per
  `CLAUDE.md` (high-risk surface → full unit tests).
- **Branch protection on `main`** — one-time GitHub admin toggle; doc already
  exists at `deploy/repo-settings.md`.
- **Bot Adaptive Cards** render pipeline (replace plain-text replies) — backlog.
- **Per-channel MCP allowlist** — MCP currently registers globally per process.

## Key file map (for the takeover)

- Bot entry / webhook / `/healthz`: `packages/teams-bot/src/server.ts`
- Env loader (every var, exact names): `packages/teams-bot/src/config.ts`
- Per-channel runtime, agent build, budget check, attribution, audit:
  `packages/teams-bot/src/bot.ts`
- Adapter + middleware wiring: `packages/teams-bot/src/adapter.ts`
- Public-only (DM refusal): `packages/teams-bot/src/middleware/public-only.ts`
- Mention-required: `packages/teams-bot/src/middleware/mention-required.ts`
- Sandboxed bash + denylist: `packages/teams-bot/src/tools/sandboxed-bash.ts`
- GitHub PR tools (note: APPROVE is blocked — never merges):
  `packages/teams-bot/src/tools/github-pr-*.ts`
- Service-account auth: `packages/teams-bot/src/auth/`
- Audit DB / budget / per-integration + per-user rollups:
  `packages/teams-bot/src/obs/audit-log.ts`
- Agent factory (shared core): `packages/core/src/agent-factory.ts`

## Gotchas

- `restify` is broken on Node 18+ — the bot uses **Express**. Don't switch back.
- `better-sqlite3` is native; the Dockerfile installs a C++ toolchain in both
  stages so the prebuild compiles. Pinned `^12.10.0` for Node 24 prebuilds.
- Default `ENTER_BOT_WORKTREES` / `ENTER_BOT_AUDIT_DB` are under `/var/lib/...`
  — not writable on a dev Mac; override to a temp dir for local runs.
- `ENTER_BOT_ALLOW_DM=1` is the **Emulator-only** escape hatch. Never set it in
  a deployed environment — it disables the public-only guarantee.
- `enter` CLI is `npm link`-ed into the developer's global bin from
  `packages/cli` — rebuilding `core`/`cli` updates the live command.
- Some sandboxes block `curl`/`sleep` in this environment — use `node`'s
  `fetch` and background-task polling instead.
- **Corporate proxy (Netskope) breaks Docker builds on the dev Mac.** The
  machine sits behind Netskope TLS interception (`ca.aurigo.goskope.com`);
  containers don't trust it, so in-build `npm ci` dies with npm's generic
  `Exit handler never called!` after ~70s of silence. Fix (verified): pass the
  exported CA as a build secret —
  `docker build --secret id=enter_ca,src=$HOME/.enter/certs/netskope-ca.pem …`
  or `ENTER_DOCKER_CA_CERT=$HOME/.enter/certs/netskope-ca.pem npm run verify:deploy`.
  The CA PEM lives at `~/.enter/certs/netskope-ca.pem`. Note Node ignores the
  Debian system CA store — the Dockerfile exports `NODE_EXTRA_CA_CERTS` in the
  install steps for this reason; `update-ca-certificates` alone is not enough.
  A cloud host without Netskope won't need the secret at all.

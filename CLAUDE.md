# CLAUDE.md

Instructions for Claude Code working in this repo. Treat these as hard rules.

## Always update docs alongside code

Any change to behavior in `packages/{core,cli,teams-bot}` must land with a corresponding update under `packages/docs/src/content/docs/`. The rules:

- New tool → add a row to `reference/tools.md`.
- New CLI flag → update `usage/cli.md` and the help text in `packages/cli/src/args.ts`.
- New env var → update `config/env.md`.
- New slash command → update `usage/slash.md`.
- New config key → update `config/file.md` (schema block + defaults block + prose).
- New role-facing capability (PM/Designer/QA/Engineer workflow) → update `contributors.md`.
- New deployment knob → update `deploy/teams-bot.md` or `deploy/cli.md`.

Don't leave docs drift to a follow-up. `npm run build:docs` must pass before a change is considered done.

## Always land tests alongside new behavior

Every new tool, hook, middleware, or non-trivial helper ships with a test under the matching `packages/<pkg>/test/<thing>.test.ts`. The test runner is `vitest` (configured at the repo root). The bar:

- **High-risk surface** (memory writes, graph upserts, bot middleware, sandboxed-bash denylist, ADO/Confluence/Aha! tool URL + body construction): full unit tests with mocked fetch / temp dirs.
- **Medium-risk surface** (config parsers, frontmatter round-trip, args parser): table-driven tests covering edge cases.
- **Low-risk glue** (CLI mode dispatch, TUI rendering): smoke tests only, or skip.

`npm test` must pass before a change is considered done. New tools added without tests block merge.

## Backlog

Feature work that's been discussed but not started lives in `BACKLOG.md` at the repo root. When you pull from there, delete the entry and create a corresponding task in the active task list.

## Naming hygiene (user-visible surfaces only)

Do NOT use these names in any user-facing surface — docs, README, system prompts (`packages/core/src/persona/`), `SOUL.md.example`, CLI help text (`packages/cli/src/args.ts:helpText`), bot replies in Teams, error messages users will read, or comments inside config files users edit:

- Hermes, Nous Research
- River, Shopify, Tobi (Lütke)
- Cline, Aider, Continue
- pi-tui, pi-agent-core, pi-ai, "pi agent toolkit", earendil-works

Code-internal imports from `@earendil-works/pi-*` are load-bearing and must stay. This rule applies only to surfaces a user can see.

## Positioning

Enter is **an autonomous teammate that turns conversations into pull requests** — for engineers, PMs, designers, and QA. The PR is the universal contribution surface; the bot lives in Microsoft Teams channels; everyone watches everyone work. Don't backslide to "coding agent" or single-role framing in new copy.

## Bot security guarantees (don't weaken without explicit user direction)

- Bot never merges PRs.
- `sandboxed_bash` denylist stays restrictive (`sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`, etc.).
- Per-channel monthly token budget always enforced.
- Public-only middleware always on; DMs only allowed via `ENTER_BOT_ALLOW_DM=1` (developer-only).
- New integrations use **service-account auth**, never per-user OAuth. Bot acts as itself; requester from Teams (`activity.from.{name, aadObjectId}`) is attribution metadata in comments / PR bodies / audit rows.

## Build commands

```
npm run build           # @enter/core + @enter/cli + @enter/teams-bot
npm run build:docs      # Astro Starlight site (must pass after docs changes)
npm run build:core      # @enter/core only
npm run build:cli       # @enter/cli only
npm run build:bot       # @enter/teams-bot only
npm run dev:cli         # tsx packages/cli/src/cli.ts
npm run dev:bot         # tsx packages/teams-bot/src/server.ts
node packages/cli/dist/cli.js help    # CLI smoke check
```

## Environment caveats

- Working dir is on OneDrive on Windows; `npm install` can be slow, and a few native modules need explicit version pinning for prebuilds on Node 24 (`better-sqlite3@^12.10.0`).
- Default platform shell is PowerShell on Windows; `bash` and `sandboxed_bash` call `getShell()` for platform detection.
- `restify` is **broken on Node 18+** (transitive `spdy`/`http-deceiver` use the removed `http_parser` binding). Express is used for the bot's webhook.

## Where things live

- **Core**: `packages/core/src/{config,memory,persona,skills,subagent,autonomous,delegates,tools,session,util}/`
- **CLI**: `packages/cli/src/{cli.ts, main.ts, args.ts, modes/, slash/, tui/}`
- **Bot**: `packages/teams-bot/src/{server.ts, bot.ts, adapter.ts, middleware/, channels/, auth/, tools/, obs/}`
- **Docs**: `packages/docs/{astro.config.mjs, src/content/docs/}`
- **Persona**: `SOUL.md.example` at repo root; bundled fallback in `packages/core/src/persona/soul-loader.ts`.

## Working with the published agent runtime

The published `@earendil-works/pi-agent-core@0.74.0` ships only `Agent`, `agent-loop`, `proxy`, and `types`. The `harness/` modules visible on GitHub (`JsonlSessionRepo`, `loadSkills`, `AgentHarness`) are **not in the published tarball** — they're reimplemented in `packages/core/src/{session,skills}/`. Don't try to import them from upstream.

Tool schemas use **`typebox`** (npm name, v1.x), not `@sinclair/typebox`. Different package, slightly different API.

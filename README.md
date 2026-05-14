# Enter

An autonomous teammate that turns conversations into pull requests.

Code, PRDs, designs, test plans, schemas — anything that belongs in your repo. Enter helps anyone on the team contribute through the same review surface engineers already trust. PMs ship product specs as PRs. Designers commit design tokens. QA opens test plans. Engineers review, refine, and merge.

Two surfaces, one core:

- **`enter`** — terminal CLI with an interactive rich UI, a headless print mode, and an autonomous loop.
- **`enter-bot`** — Microsoft Teams bot. Public channels only. Mention it, and the whole team watches it work. DMs are refused so every interaction stays visible.

## Quickstart (CLI)

```
npm install
npm run build
ANTHROPIC_API_KEY=sk-ant-... node packages/cli/dist/cli.js --print "hello"
```

## Packages

| Package | Description |
|---|---|
| `@enter/core` | Agent runtime extensions: memory + graph, autonomous loop, subagent, delegate-to-claude-code, tools, system-prompt composition. |
| `enter` (`@enter/cli`) | CLI binary built on `@enter/core`. |
| `@enter/teams-bot` | Bot Framework webhook server that runs Enter in Microsoft Teams channels. |

## Runtime data

The CLI keeps state under `~/.enter/`:

- `config.json`, `SOUL.md` — config and persona
- `memory/` — `MEMORY.md` index, `memories.db` (SQLite + FTS5 + nodes/edges), per-type markdown
- `skills/` — agent-authored and user-authored `SKILL.md`
- `sessions/` — JSONL session log per session
- `exports/` — markdown + JSONL trajectory dumps

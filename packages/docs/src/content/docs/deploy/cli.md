---
title: CLI on Your Machine
description: Installing the enter binary and persisting your API key.
---

After `npm install`, one root-level script wires up the global `enter` binary and links the workspace packages into it.

## Install

```powershell
npm install            # workspace deps
npm run install:local  # builds @enter/core + @enter/cli, runs npm link for both
```

This is what `install:local` does under the hood:

1. `npm run build:core` then `npm run build:cli` — produces `dist/` for both packages.
2. `npm link --workspace @enter/core` — creates a global symlink so `@enter/cli` can resolve its workspace dep.
3. `npm link @enter/core --workspace @enter/cli` — points the CLI's local `node_modules/@enter/core` at the global link.
4. `npm link --workspace @enter/cli` — registers `enter` on your global `PATH`.

After that, `where.exe enter` (Windows) or `which enter` (Unix) should resolve. Re-running `install:local` after a code change just rebuilds and re-links — the symlink targets the workspace directly, so `dist/` updates are picked up immediately.

To reverse it:

```powershell
npm run uninstall:local
```

This calls `npm unlink -g @enter/cli @enter/core` and removes the symlinks. Useful when switching between checkouts of the same package.

## Sign in

First-run sign-in is automatic: when no key is configured for the active provider, `enter` prints a one-line banner and prompts you for one. The key is written to `~/.enter/keys.json` with `mode 0600` (owner read/write only on POSIX; per-user profile ACL on Windows).

Manual variants:

```powershell
enter login                       # prompts and persists for the default provider
enter login --provider openai     # adds an openai entry alongside anthropic
enter logout                      # removes the default provider's saved key
enter logout --provider openai    # removes the openai entry
```

### Override at the env-var level

`ANTHROPIC_API_KEY` (and the equivalent var for other providers) wins over `keys.json` on every run. Useful for CI runners where the key comes from a secret store:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # session-scoped override
enter --print "smoke test"
```

You don't need to call `enter login` if the env var is set — Enter only prompts when *both* the env var and `keys.json` are empty.

:::caution[Don't commit your key]
`~/.enter/keys.json` is reserved for runtime key state; it lives outside any repo. If you leak a key, rotate it at the Anthropic console immediately — the leaked value is what matters, not what file it ended up in.
:::

## Where Enter keeps state

- `~/.enter/config.json` — your overrides (see [Config File](/config/file/)).
- `~/.enter/keys.json` — saved API keys, one per provider (`{ "anthropic": "sk-...", "openai": "sk-..." }`). Created on first `enter login` / first-run prompt.
- `~/.enter/SOUL.md` — your custom persona (or absent → bundled fallback).
- `~/.enter/memory/` — `MEMORY.md` index, `memories.db`, and per-type markdown files.
- `~/.enter/skills/` — user-level skills.
- `~/.enter/sessions/` — JSONL session log per session.
- `~/.enter/exports/` — markdown + JSONL exports.

Set `ENTER_HOME` to relocate the whole tree. Useful for sandboxed CI runs.

## Publishing to npm (future)

`install:local` works from a cloned monorepo. When we're ready to ship `@enter/cli` to a registry, the flow becomes `npm publish --workspace @enter/core && npm publish --workspace @enter/cli`, and users install with `npm install -g @enter/cli`. That's not wired up yet — `@enter/cli` declares `@enter/core@0.1.0` as a workspace dep that doesn't exist on any registry. When publishing, the dep version will need to track the published `@enter/core`, and a `"prepare": "npm run build"` script should be added to each publishable package.

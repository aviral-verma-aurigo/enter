---
title: Skills Authoring
description: Writing SKILL.md by hand vs via the author_skill tool.
---

You can author a skill two ways: by hand, or by asking the agent to do it via the `author_skill` tool.

## By hand

Create a directory under one of the skill roots:

- `~/.enter/skills/<name>/SKILL.md` — available everywhere.
- `<repo>/.enter/skills/<name>/SKILL.md` — available only in that repo.

Add YAML frontmatter and a markdown body:

```md
---
name: pin-package-version
description: Use when a dependency bump breaks the build and you need to pin it back.
---

## Procedure

1. Find the failing package: `npm ls <package>` or read the error.
2. Pin it in `package.json` to the last working version.
3. Run `npm install` and re-run the failing build.
4. Commit with message `chore: pin <package> to <version> (was breaking <thing>)`.
5. Open an issue in the repo to track the underlying break.
```

Validation rules:

- `name` must match `^[a-z0-9][a-z0-9-]{0,63}$`.
- `description` must be non-empty.
- Duplicate names — first definition wins; later ones become diagnostics.

## Via `author_skill`

Inside an interactive session, the agent can author a new skill itself:

```text
author_skill(
  name: "pin-package-version",
  trigger: "When a dependency bump breaks the build and you need to pin it back",
  procedure: "1. Find the failing package...\n2. ...",
  rationale: "I've done this manually three times this month."
)
```

The tool builds a candidate body, runs a one-shot LLM critique (using `ANTHROPIC_API_KEY` and the configured chat model), and writes to `~/.enter/skills/<name>/SKILL.md`. If the critique returns `REFUSE: <reason>`, the file is **not** written and the reason flows back to the agent.

Pass `skipCritique` on the runtime to bypass the critique — useful for tests; not recommended for production.

## When does a skill fire?

Skills are surfaced to the model via the system prompt as a labeled list of (name, description). The model decides whether to follow the procedure based on the `description` (the trigger). If you want a skill listed but **not** offered to the model, add `disable-model-invocation: true` to the frontmatter.

## Inspecting loaded skills

`/skills` lists what's been discovered. It prints one line per skill directory; entries without a valid `SKILL.md` are flagged.

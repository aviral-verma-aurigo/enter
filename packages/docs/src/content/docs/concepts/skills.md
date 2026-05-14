---
title: Skills
description: SKILL.md format, where skills are discovered, and how author_skill works.
---

A skill is a directory with a `SKILL.md` inside it. Skills carry a name, a trigger description, and a procedure body. Loaded skills are surfaced to the model in the system prompt so it knows to reach for them when the trigger applies.

## SKILL.md format

YAML frontmatter plus a markdown body:

```md
---
name: bisect-flaky-test
description: Use when a single vitest spec is flaky and you need to find the regression commit.
---

## Procedure

1. Run `npm test -- <spec>` 10 times. Record pass/fail.
2. If >2 failures: `git bisect start HEAD <last-known-green>`.
3. Run the spec inside each bisect step. Mark good/bad accordingly.
4. When bisect reports the bad commit, open it with `git show` and diff against parent.
```

Required frontmatter:

- `name` — kebab-case, `^[a-z0-9][a-z0-9-]{0,63}$`.
- `description` — when should the agent reach for this? (the "trigger")

Optional:

- `disable-model-invocation: true` — list but don't surface to the model.

## Discovery

Two roots, in this order:

1. `~/.enter/skills/<name>/SKILL.md` — user-level, available everywhere.
2. `<cwd>/.enter/skills/<name>/SKILL.md` — project-level, available only in that repo.

`loadSkills` walks each root up to 4 levels deep, looks for any `SKILL.md`, parses the frontmatter, and dedupes by `name` (first definition wins; later collisions become diagnostics).

## The `author_skill` tool

When the agent notices a recurring procedure worth promoting, it can author a new skill itself:

```text
author_skill(
  name: "bisect-flaky-test",
  trigger: "When a single test is flaky and you need to find the regression commit",
  procedure: "1. Run the spec N times...\n2. ...",
  rationale: "I had to walk through this with the user three times last month."
)
```

Behavior:

1. The tool builds a candidate SKILL.md body from the inputs.
2. Unless `skipCritique` is set on the runtime, the tool fires a one-shot LLM critique asking: is the trigger specific? Is the procedure idempotent? Does it look duplicated?
3. If the critique returns a line starting with `REFUSE:`, no file is written and the agent is told why.
4. Otherwise the polished body is written to `~/.enter/skills/<name>/SKILL.md`.

:::note
The critique runs against the configured chat model and uses `ANTHROPIC_API_KEY`. It's a deliberate guardrail — `author_skill` is durable state, so a one-shot review pays for itself.
:::

See [Skills Authoring](/config/skills/) for the hand-written workflow.

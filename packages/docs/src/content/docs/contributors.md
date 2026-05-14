---
title: Who Contributes
description: How engineers, PMs, designers, and QA each use Enter — concrete prompts and workflows per role.
---

The PR is the universal contribution surface. Whether you write Go or design tokens, you contribute the same way: mention Enter in your team's channel, describe what you want, and a pull request lands in the repo for review.

This page shows what that looks like per role. Engineers will recognize the patterns; the rest are new.

:::tip
All examples below assume the bot is `@`-mentioned in a public Teams channel and the relevant integrations (GitHub App, ADO, Confluence, Aha!) are configured. The bot acts under a service account; your Teams identity appears in the PR description and every linked comment.
:::

## Engineers

The familiar review surface, with more upstream context wired in.

**Example prompt:**

```text
@Enter clone acme/checkout, add a /health endpoint to apps/api/src/server.ts
that returns {"ok": true}, run the tests, open a PR. Link to AB#1234.
```

**What fires:**

- `git_clone`, `read`, `edit`, `run_tests`, `sandboxed_bash` (branch + commit), `git_push`, `github_pr_open`.
- ADO auto-link injects the work-item reference into the PR body.

**What's new for engineers:** the bot can pull the PRD from Confluence or the Aha! feature description as context before writing code. Your prompt can say *"...follow the spec at confluence://product/checkout/health-endpoint"* and the bot will read it before editing.

## Product Managers

Specs as PRs. PRDs, ADRs, decision records, and roadmap notes all live in the repo, versioned and reviewable.

**Example prompt:**

```text
@Enter clone acme/product, draft a PRD at docs/prds/inventory-sync.md.
Cover: goals, scope, out-of-scope, open questions, metrics. Reference AB#2310
and the Aha! feature INV-42. Open a PR; tag the engineering reviewers from
#team-inventory.
```

**What fires:**

- `git_clone`, `write` (PRD markdown), `git_push`, `github_pr_open`.
- `ado_work_item_get` to pull AB#2310's title and acceptance criteria into the PRD.
- `aha_feature_get` for the INV-42 description, target release, and current status.
- `github_pr_open` auto-links AB#2310 into the PR description.

**What you don't have to do:** open a separate doc, copy-paste from Aha!, ping engineering on a different surface. Everything lives next to the code that implements it.

## Designers

Design tokens, component specs, and asset commits flow through the repo like any other change. Reviewable, versioned, blameable.

**Example prompt:**

```text
@Enter clone acme/web, update the design token at packages/tokens/colors.json
to add a new "danger-subtle" shade matching the spec in the Figma file
linked in #design-system. Also add an MDX component spec at
packages/ui/src/banner/spec.mdx. Open a PR.
```

**What fires:**

- `git_clone`, `read` (existing tokens for context), `edit` (token JSON), `write` (component MDX), `git_push`, `github_pr_open`.
- `confluence_search` if you reference a design rationale doc; the bot pulls the rationale into the PR description.

**What you don't have to do:** explain the change to an engineer who then commits it for you. The change is yours; engineering reviews and merges.

## QA Engineers

Test plans, test cases, and reproductions ship as PRs. Each one traces back to the work item being verified.

**Example prompt:**

```text
@Enter clone acme/checkout, draft a test plan at qa/plans/payment-retry.md
covering the new retry logic in AB#3120. Include happy path, network-error
paths, and idempotency cases. Link to the related Confluence runbook for
production payment failures. Open a PR.
```

**What fires:**

- `git_clone`, `read` (existing tests / runbook style), `confluence_page_get` (the runbook), `ado_work_item_get` (AB#3120 acceptance criteria), `write` (the test plan), `git_push`, `github_pr_open`.
- ADO auto-link puts AB#3120 in the PR body.

**What you don't have to do:** track scenarios in a separate test-management tool that no one else reads. Test plans live with the code they verify.

## How attribution works

For every action above:

- The bot account does the actual write (commit author, ADO comment author, Confluence page author).
- Your Teams identity (name + Entra ID) is recorded as the **requester** — visible in the PR body, in linked work-item comments, in the audit log.
- Branch-protection rules, required reviewers, and merge gates all behave normally. Humans review; the bot never merges.

See [Deployment](/deploy/teams-bot/) for the service-account auth setup. Once configured, every team member can use Enter without doing anything themselves.

## What doesn't work yet (and what's planned)

- **Figma asset import** — you can paste an SVG into the prompt and the bot will commit it, but native Figma read-through requires the Figma integration (planned).
- **Per-user on-behalf-of writes** — actions are always done by the bot account today. If your security policy requires a specific human be the commit author for some artifacts, that workflow is planned for v0.2.
- **Binary asset handling beyond SVG** — PNG/JPG/MP4 commits work via `sandboxed_bash` and `curl` (currently denylisted; admin can permit a Figma-only allowlist), but a dedicated `commit_asset` tool with size limits is on the roadmap.

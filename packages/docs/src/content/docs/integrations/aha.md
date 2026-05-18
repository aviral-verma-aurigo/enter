---
title: Aha!
description: Pull feature and release context into the agent; comment on features from CLI or Teams.
---

Aha! is Enter's product-roadmap integration. With it wired up, the agent can resolve a feature reference (e.g. `APP-123`) into its name, status, assignee, target release, and description — and leave a comment back on the feature when work is in motion.

## What it lets the agent do

- Fetch a feature by `reference_num` (e.g. `APP-123`) or numeric ID — returns name, status, assigned_to, release, description, and the Aha! web URL.
- Fetch a release by reference_num or numeric ID — returns name, release_date, derived status (`in development` / `released` / `scheduled`), and the parking_lot flag.
- Comment on a feature. Body is HTML-escaped before posting.

## Auth setup

| Variable | Notes |
|---|---|
| `AHA_BASE_URL` | Aha! instance URL, e.g. `https://your.aha.io`. |
| `AHA_API_KEY` | API key from `Aha! → Settings → Account → API`. Use a service-account user, not your personal account. |

Both must be set together. If either is missing, Aha! tools are not registered.

## Tools exposed

See [`reference/tools` → Aha!](/reference/tools/#aha) for the full parameter list. Quick summary:

**Read:** `aha_feature_get`, `aha_release_get`
**Write:** `aha_feature_comment`

## Attribution

Comments are authored by the service-account user that owns the API key. The agent appends an HTML-escaped attribution footer naming the human who triggered the request (Teams `activity.from.name`, or the CLI user). Anyone reading the comment in Aha! sees both: service-account identity in the author field, requester in the body.

## Gotchas

- **Reference vs numeric ID** — both `aha_feature_get` and `aha_release_get` accept either form. Prefer `reference_num` (`APP-123`) in PR bodies and commit messages so humans can click through.
- **Derived release status** — `aha_release_get` computes status (`in development` / `released` / `scheduled`) from `release_date` and the `released` flag. Aha! itself doesn't expose a single status field on releases — don't go looking for one in the API response.
- **No feature create/update yet** — the integration is intentionally read-heavy on the feature side. Status updates flow through PR merges and ADO state changes, not through Aha! writes.

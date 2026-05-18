---
title: Repository Settings
description: Branch protection, required status checks, and the one-time GitHub repo configuration that pairs with CI.
---

CI (`.github/workflows/ci.yml`) ships with the repo and runs on every push and pull request to `main`. To make it actually *block* bad changes from landing, pair it with branch protection.

## Recommended branch protection on `main`

Set these once in the GitHub UI under **Settings → Branches → Add branch protection rule** for `main`:

| Setting | Value | Why |
|---|---|---|
| Require a pull request before merging | ✓ | No direct pushes to `main`. |
| Require approvals | ✓ (1 minimum) | At least one reviewer. |
| Dismiss stale pull request approvals when new commits are pushed | ✓ | Force re-review after a force-push or new commit. |
| Require status checks to pass before merging | ✓ | The CI matrix below must be green. |
| Required status checks | `build · test · docs (node 20.x)`, `build · test · docs (node 24.x)` | Both matrix legs must pass. |
| Require branches to be up to date before merging | ✓ | Avoids the "passes on the branch, breaks on main" class of regression. |
| Require conversation resolution before merging | ✓ | Review comments must be resolved. |
| Do not allow bypassing the above settings | ✓ | Admins can't push directly either. |
| Restrict who can push to matching branches | (optional) | Use if you want only specific people to merge. |
| Allow force pushes | ✗ | Off — force-push to `main` destroys history. |
| Allow deletions | ✗ | Off — never delete `main`. |

## One-command setup via the `gh` CLI

Once you've installed and authenticated [GitHub CLI](https://cli.github.com/) (`gh auth login`), you can apply the rule without clicking through the UI:

```powershell
gh api -X PUT repos/aviral-verma-aurigo/enter/branches/main/protection `
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "build · test · docs (node 20.x)",
      "build · test · docs (node 24.x)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

(On bash/zsh, replace the trailing ``` ` ``` line-continuation with a single line or use a different heredoc style — the JSON is the same.)

:::caution[Run the CI at least once first]
The "required status checks" list only accepts check names that have actually run against the repo. Push any change (or open and close a throwaway PR) to make the matrix names visible to GitHub before applying the rule.
:::

## What CI checks today

From `.github/workflows/ci.yml`:

- Node 20 and Node 24 matrix on `ubuntu-latest`.
- `npm ci --build-from-source=false` (uses native-module prebuilds).
- `npm run build` — `@enter/core` + `@enter/cli` + `@enter/teams-bot`.
- `npm test` — full vitest suite.
- `npm run build:docs` — the Astro static site.
- Uploads `packages/docs/dist` as a 14-day artifact on the Node 24 leg.

When any step fails, the matching status check turns red and merging is blocked.

## Optional: GitHub Pages for docs

Once CI is green, you can publish the docs site by:

1. **Settings → Pages → Source: GitHub Actions**.
2. Add a second workflow (`.github/workflows/docs.yml`) that downloads the `docs-dist` artifact from `ci.yml` and deploys to Pages. Or fold the deploy into `ci.yml` and gate it on `if: github.ref == 'refs/heads/main'`.

This is not on by default — opt in when you're ready to make the docs public.

## Recommended `CODEOWNERS`

Drop `.github/CODEOWNERS` to auto-request reviewers based on which paths a PR touches. Minimal example:

```
# Default owner for everything
*                            @aviral-verma-aurigo

# Docs changes can be reviewed by anyone on the docs team
/packages/docs/              @aviral-verma-aurigo

# Bot security-sensitive code wants extra eyes
/packages/teams-bot/src/middleware/  @aviral-verma-aurigo
/packages/teams-bot/src/auth/        @aviral-verma-aurigo
```

The `CODEOWNERS` file pairs with the "Require review from Code Owners" branch-protection toggle.

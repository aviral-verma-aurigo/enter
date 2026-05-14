---
title: GitHub App Setup
description: Register a GitHub App for the Teams bot — permissions, install, env vars.
---

The Teams bot acts as a GitHub App, not a personal access token. That gives the bot a stable identity, scoped permissions, and per-installation isolation.

## 1. Register the App

Go to [github.com/settings/apps/new](https://github.com/settings/apps/new) (personal) or `https://github.com/organizations/<org>/settings/apps/new` (organization-owned).

Fill in:

- **GitHub App name** — e.g. `enter-bot-<org>`.
- **Homepage URL** — link to your internal Enter docs is fine.
- **Webhook** — disable (Enter doesn't consume GitHub webhooks).
- **Permissions** (Repository):
  - **Contents** — Read & Write (required for clone / push).
  - **Pull requests** — Read & Write (required for `github_pr_open`).
  - **Issues** — Read & Write (optional, only if you use `github_pr_comment` against issues).
- **Subscribe to events** — none.
- **Where can this GitHub App be installed?** — `Only on this account`.

Generate and download a private key (`.pem`).

## 2. Install on specific repos

From the App's settings page, click **Install App** → pick the account → choose **Only select repositories** → check the repos you want Enter to be able to touch.

The bot can only clone repos it's installed on. There is no per-call install step.

## 3. Set env vars

On the bot host:

```text
GITHUB_APP_ID                = 123456
GITHUB_APP_PRIVATE_KEY_PATH  = /etc/secrets/enter-bot.pem
```

Or, if you can't mount a file (e.g. some serverless hosts), pass the PEM inline. Escape newlines as `\n` in the env value:

```text
GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n"
```

`GITHUB_APP_INSTALLATION_ID` is **optional**. If unset, Octokit auto-discovers the installation for the target repo on each call. Set it if you want to pin to one installation (e.g. multi-org hosting).

## 4. Repo allowlist

By default, `git_clone` will accept any `owner/name` reference that resolves to an installation. Lock it down:

```text
ENTER_BOT_ALLOWED_REPOS=acme/foo,acme/bar
```

When set, `git_clone` refuses any repo not in the list — even if the App technically has access.

## 5. What the bot can and can't do

With the permissions above, the bot can:

- Clone the repo into the channel's worktree.
- Create branches and push them.
- Open and comment on PRs.

It cannot:

- Merge PRs (it has no permission to, and the tools won't try).
- Touch GitHub Actions, secrets, deploy keys, releases, or org-level settings.
- Reach repos outside its installation list.

:::caution[Rotate the key]
The `.pem` is a credential. Rotate it when team members leave or when you suspect exposure. GitHub Apps support multiple private keys at once — generate a new one, deploy it, then delete the old one.
:::

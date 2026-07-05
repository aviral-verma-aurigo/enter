# Teams app manifest

Side-load package for `enter-bot`. Produces the `.zip` you upload to a team.

## What's here

- `manifest.json` — the Teams app definition. **Scopes are `team` and `groupchat` only** — `personal` (DM) scope is intentionally omitted to match the bot's public-only guarantee.
- `color.png` — **you provide.** 192×192 px, full color. App icon shown in the store/flyout.
- `outline.png` — **you provide.** 32×32 px, transparent background, single-color (white) silhouette.

## Fill in before packaging

In `manifest.json`, replace:

- `id` and `bots[0].botId` → your **Microsoft App ID** (the Azure Bot resource App ID). Both must be the same value.
- `developer.*` and `packageName` → your org's details.

## Package and upload

```sh
cd packages/teams-bot/teams-manifest
zip enter-bot-teams.zip manifest.json color.png outline.png
```

Then in Teams: **Apps → Manage your apps → Upload an app → Upload a custom app**, pick the `.zip`, and add it to a test team. (Custom app upload must be enabled in your Teams admin org settings.)

Once added, mention the bot in a channel — `@Enter` — to talk to it. It will not respond in DMs.

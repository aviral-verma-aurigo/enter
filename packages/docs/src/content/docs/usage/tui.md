---
title: Interactive TUI
description: The rich interactive renderer — layout, key handling, and the simple fallback.
---

When you run `enter` without `--print` or `--autonomous`, the CLI launches Enter's rich terminal renderer. It's the default interactive experience.

## Layout

Three regions, top to bottom:

- **Header.** Provider, model, session ID, cwd.
- **Transcript.** Scrollback of user messages, assistant text, tool calls, and tool results. Tool calls render with a colored label (e.g. "Recall memory", "Run shell command") and a collapsible details block.
- **Loader / editor.** While the agent is thinking or running a tool, the bottom region shows a spinner. When idle, it's a multi-line editor with line numbers, history (up/down), and inline syntax cues.

## Key handling

- **Enter** — submit. **Shift+Enter** — newline.
- **Ctrl+C** — first press: cancel the current request (`agent.abort()`). Second press: exit.
- **Ctrl+L** — clear the transcript region (history is preserved).
- **PageUp / PageDown** — scroll the transcript.
- **Up / Down** — cycle through your prompt history.

Lines that start with `/` are dispatched as [slash commands](/usage/slash/) without going through the model.

## The `--simple` fallback

The rich renderer repaints the full terminal. If you're inside a screen-multiplexer-of-a-screen-multiplexer, on a serial console, in some CI runners, or you just want a plain `readline` experience, pass `--simple`:

```powershell
enter --simple
```

In simple mode the transcript is line-buffered to stdout, prompts use raw `readline`, and tool results are pretty-printed but not boxed.

## Color

ANSI is on by default. Disable with `--no-color` or the standard `NO_COLOR` environment variable. The `ui.color` config key (see [Config File](/config/file/)) is the persistent equivalent.

:::tip
If colors look wrong but the layout is fine, your terminal's truecolor support might be off. `NO_COLOR=1 enter` strips ANSI entirely as a sanity check.
:::

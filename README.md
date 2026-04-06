<p align="center">
  <img src="./assets/icon.png" alt="Sentinel logo" width="80" />
</p>

<h1 align="center">Sentinel</h1>

<p align="center">
  Local-first desktop AI workspace for real software projects.
</p>

<p align="center">
  <a href="https://github.com/Cronacl/Sentinel/releases">Download</a>
  ·
  <a href="#getting-started">Run locally</a>
  ·
  <a href="#build">Build from source</a>
  ·
  <a href="./docs/macos-signing.md">macOS signing</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-f59e0b?style=flat-square" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-desktop-3b82f6?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-111827?style=flat-square" />
</p>

Sentinel is a desktop app for working with AI inside a real codebase.

It keeps the repo, the thread, the terminal, the browser, and the runtime in one place. Models, approvals, memory, automations, integrations, and repo state all stay close to the work too.

Open a workspace. Start a thread. Read code, plan something, make edits, run commands, inspect diffs, commit, push, open a PR, come back later, keep going.

## Status

Sentinel is still alpha.

Some parts are solid. Some parts are rough. Things will change.

## Download

Release builds are published on GitHub Releases:

- [Download the latest release](https://github.com/Cronacl/Sentinel/releases)
- macOS builds are available as DMGs
- Windows builds are available as NSIS installers
- Linux builds are available as AppImages

If you want the current development version, run it locally from source.

## What Sentinel Is

The workspace is a real local folder. The thread is the main unit of work. Repo state matters. Longer tasks need more than a prompt box.

Each thread lives inside a workspace, and that workspace can point at a local project folder. From there the app can keep track of repo state, model state, approvals, checkpoints, worktrees, queued follow-ups, and the rest of the thread context without making you rebuild it every time.

## How The App Is Shaped

A workspace points at a local project directory.

Inside that workspace, you start threads. A thread can be a normal chat or a plan. While you work, Sentinel keeps the thread close to the repo, the model, the runtime, the terminal, the diff, and the rest of the task context.

The shell stays around that work. The left side is for workspaces and threads. The center is the active thread. The bottom panel is the terminal. The right side is where diffs, PR state, browser tabs, and delegated runs show up.

The short version is simple: workspace, thread, chat or plan, edit, run, diff, commit, push, PR.

## At A Glance

| Area              | What it covers                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| Workspaces        | Local project folders, thread history, workspace-level context          |
| Threads           | Chat mode, plan mode, queued follow-ups, checkpoints, long-running work |
| Repo workflow     | Diffs, branches, worktrees, commits, push, PR flow                      |
| Built-in tools    | Terminal, browser, attachments, voice input, approvals                  |
| AI setup          | Multiple engines, provider support, model selection, reasoning controls |
| Long-term context | Memory, context compaction, recurring automations                       |
| Extensibility     | Skills, MCP servers, integrations                                       |

## What The Runtime Looks Like

Sentinel supports three engines: `sentinel`, `codex`, and `claude`.

`sentinel` is the built-in harness. It handles the app side of the run so the thread can keep its state over time.

`codex` and `claude` are local runtimes carried inside the Sentinel shell. The runtime changes, but the thread still lives in Sentinel with the same workspace, repo panels, approvals, settings, and history around it.

The thread is carrying more than messages. It can also carry the current engine, model, working directory, queued follow-ups, repo checkpoint state, and runtime-linked session state.

Compaction is part of this too. Longer threads can tighten older context and keep moving without dragging every raw turn forward forever.

## How The Work Holds Together

Workspaces map to local folders. Threads live inside those workspaces. You can pin them, archive them, switch between chat mode and plan mode, and come back later without losing the task state around the work.

The repo stays attached to the thread. Sentinel can inspect status, show diffs, create and switch branches, commit, push, open a PR, and isolate thread work in a worktree. It also keeps checkpoints tied to thread history, which helps once the work starts branching.

The rest of the app stays close to that thread. There is a built-in terminal, a built-in browser, file and document attachments, voice input, and approvals around tool use. For longer tasks, there is plan mode, queued follow-ups, memory, context compaction, and recurring automations.

Skills, MCP servers, and integrations sit around the same flow. They are separate systems because they do different jobs, but they still land back in the same workspace and thread model.

| Surface    | Included                                                          |
| ---------- | ----------------------------------------------------------------- |
| Core shell | Workspaces, threads, sidebars, command palette                    |
| Repo tools | Status, diffs, branches, worktrees, commits, PR flow, checkpoints |
| Execution  | Terminal, approvals, runtime controls                             |
| Context    | Plan mode, follow-ups, memory, context compaction                 |
| Inputs     | File attachments, document loading, voice input                   |
| Extensions | Skills, MCP servers, integrations, automations                    |

## Providers

Sentinel supports OpenAI, Anthropic, Google AI Studio, Google Vertex AI, xAI, Azure OpenAI, Amazon Bedrock, Groq, Cohere, Moonshot AI, Mistral, Ollama, OpenRouter, and Vercel AI Gateway.

## Integrations

The app can connect to systems around the repo, depending on how you set it up. Current integrations include Gmail, Google Calendar, Google Drive, Slack, Notion, GitHub, Linear, Airtable, PostgreSQL, MySQL, MongoDB, Yahoo Finance, arXiv, and PubMed.

Some use OAuth. Some use connection config or API credentials. A few are authless.

## Why People Use It

Sentinel makes the most sense when the work is bigger than a one-off prompt.

It helps when the repo matters, when the thread needs to keep state over time, when you want plans, diffs, approvals, and commands in the same place, when you want local runtimes and local project context, and when you want recurring tasks or saved memory around the project.

If you only want a quick chat box, this is probably more app than you need.

## Local-first by default

Sentinel keeps its state on your machine.

That means SQLite for app data, encrypted stored credentials and config, local backup and export tools, and optional memory that stays off by default.

This is a desktop app first. A lot of the useful parts depend on running close to the local repo and local tools.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)

### Run locally

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

The app runs at `http://localhost:3232`.

`ENCRYPTION_KEY` can be left empty in `.env`. Sentinel will generate one on first desktop launch.

### Environment variables

| Variable              | Required | Description                               |
| --------------------- | -------- | ----------------------------------------- |
| `ENCRYPTION_KEY`      | No       | Generated on first launch if omitted      |
| `SENTINEL_DB_PATH`    | No       | Custom path for the local SQLite database |
| `SENTINEL_STATE_PATH` | No       | Custom path for app state                 |
| `SENTINEL_APP_URL`    | No       | Override the default app URL              |

## Build

### macOS

```bash
bun run build:desktop:mac
```

For a single architecture package:

```bash
bun run build:desktop:mac:arm64
bun run build:desktop:mac:x64
```

For signed macOS builds, see [docs/macos-signing.md](docs/macos-signing.md).

### Windows

```bash
bun run build:desktop:windows
```

### Linux

```bash
bun run build:desktop:linux
```

## Notes

Sentinel is desktop-first. A lot of the useful parts depend on being close to the local repo and local tools.

State stays on your machine unless you connect external providers or integrations.

Updates are currently distributed through GitHub Releases.

## License

Apache-2.0

# Sentinel

> Local-first desktop workspace for software development with AI.
> Your project, your thread, your tools, and your runtime in one place.

## ![Status](https://img.shields.io/badge/status-alpha-orange?style=flat-square)

## Overview

Sentinel gives you a workspace, a thread, your repo, your tools, and your runtime in one place. It is built around the normal shape of development work.

---

## How It Works

Start with a local project. Open a thread inside that workspace. From there you can:

- inspect files
- switch models
- use plan mode
- run tools with approvals
- work through diffs
- keep moving without losing context

---

## Workflow

Sentinel is shaped around the tasks developers actually do:

| Step           | What it covers                                   |
| -------------- | ------------------------------------------------ |
| **Understand** | Browse and inspect the codebase                  |
| **Plan**       | Use plan mode when the task needs structure      |
| **Edit**       | Make changes and review diffs                    |
| **Run**        | Execute commands in the built-in terminal        |
| **Ship**       | Commit, push, and open a PR                      |
| **Branch**     | Spin up worktrees for parallel execution         |
| **Resume**     | Come back later with project context still there |

---

## What's Included

- Workspace-based threads
- Multi-model support
- Local Codex and Claude Code runtime support
- Plan mode
- Repo-aware actions for diffs, branches, commits, push, and PR flow
- Native worktree support for parallel execution
- Built-in browser and terminal
- Memory with global and workspace scope
- Recurring automations
- MCP support
- Installable skills

---

## Engines & Providers

Sentinel has three engines:

| Engine     | Description                       |
| ---------- | --------------------------------- |
| `sentinel` | Built-in app harness              |
| `codex`    | Local Codex runtime support       |
| `claude`   | Local Claude Code runtime support |

### The `sentinel` Engine

The `sentinel` engine is the app harness. It handles the parts around the model that make the workflow hold together:

<details>
<summary>See what it handles</summary>

- System prompt and runtime context assembly
- Project and workspace discovery
- Tool routing instead of dumping every tool into every step
- Approvals and permission boundaries
- Plan mode
- Context compaction so long-running threads stay usable
- Memory retrieval and autosave
- Integrations and MCP loading
- Search and web fetch
- Streamed thread state and queued follow-ups
- Repo checkpoints so code changes inside a thread can be tracked and restored

</details>

### Supported Providers

| Provider         | Provider          |
| ---------------- | ----------------- |
| OpenAI           | Anthropic         |
| Google AI Studio | Google Vertex AI  |
| xAI              | Azure OpenAI      |
| Amazon Bedrock   | Groq              |
| Cohere           | Moonshot AI       |
| Mistral          | Ollama            |
| OpenRouter       | Vercel AI Gateway |

---

## Integrations

Sentinel can connect to the systems around your repo:

| Category            | Integrations                  |
| ------------------- | ----------------------------- |
| **Communication**   | Gmail, Slack, Google Calendar |
| **Storage & Docs**  | Google Drive, Notion          |
| **Dev & Project**   | GitHub, Linear, Airtable      |
| **Databases**       | PostgreSQL, MySQL, MongoDB    |
| **Data & Research** | Yahoo Finance, arXiv, PubMed  |

---

## Local-First

Sentinel keeps its state on your machine.

- Local SQLite database
- Encrypted stored credentials and config
- Backup and export tools
- Memory is optional and off by default

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed on your machine

### Run Locally

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

The app runs at `http://localhost:3232`.

> [!NOTE]
> `ENCRYPTION_KEY` can be left empty in `.env`. Sentinel will generate one on first desktop launch.

### Environment Variables

| Variable              | Required | Description                               |
| --------------------- | -------- | ----------------------------------------- |
| `ENCRYPTION_KEY`      | No       | Auto-generated on first launch if omitted |
| `SENTINEL_DB_PATH`    | No       | Custom path for the local SQLite database |
| `SENTINEL_STATE_PATH` | No       | Custom path for app state                 |
| `SENTINEL_APP_URL`    | No       | Override the default app URL              |

---

## Build

### macOS

```bash
bun run build:desktop:mac
```

This produces both `arm64` and `x64` DMG artifacts. For a single-architecture package, use `bun run build:desktop:mac:arm64` or `bun run build:desktop:mac:x64`.

For signed macOS builds, see [`docs/macos-signing.md`](docs/macos-signing.md).

### Windows

```bash
bun run build:desktop:windows
```

### Linux

```bash
bun run build:desktop:linux
```

---

## Status

> [!WARNING]
> Sentinel is currently in alpha. Expect rough edges, breaking changes, and things that do not work yet.

---

## License

Apache-2.0

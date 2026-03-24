# Sentinel

A local-first AI desktop assistant by [Cronacl](https://github.com/Cronacl). Chat with multiple AI providers, connect your tools, and automate workflows — all from a single app that keeps your data on your machine.

> **Status:** Alpha — expect breaking changes and rough edges.

## Features

- **Multi-model AI chat** — OpenAI, Anthropic, Google Gemini, and Vertex AI
- **Workspaces** — organize threads by project directory
- **Plan mode** — break conversations into structured tasks and subtasks
- **Automations** — schedule recurring workflows (hourly, daily, weekly, cron)
- **Semantic memory** — vector-based recall across conversations
- **11 integrations** — Gmail, Google Calendar, Google Drive, Slack, GitHub, Linear, Notion, Airtable, PostgreSQL, MySQL, MongoDB
- **MCP support** — Model Context Protocol servers (stdio & HTTP)
- **Skills** — install and manage custom skill packs
- **Web search** — Exa and SearXNG providers
- **Local-first** — SQLite database stored on your machine, encrypted at rest

## Prerequisites

- [Bun](https://bun.sh) 1.3.6
- Node.js 21.7.3

## Getting Started

```bash
# Install dependencies
bun install

# Start development (web)
bun run dev

# Start development (desktop)
bun run dev:desktop
```

The app runs on `http://localhost:3232` by default.

## Environment

Copy `.env.example` to `.env`. The `ENCRYPTION_KEY` is auto-generated on first desktop launch, or you can set a 64-character hex string manually.

## Building

```bash
bun run build:desktop:mac       # macOS (.dmg)
bun run build:desktop:windows   # Windows (.exe)
bun run build:desktop:linux     # Linux (.AppImage)
```

## Contributing

The repo uses Conventional Commits, local `lefthook` automation, and a `release-please` release PR workflow. See [docs/release-process.md](docs/release-process.md) for the contributor and release process.

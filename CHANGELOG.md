# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1-alpha.1] - 2026-03-24

### Patch

- Fix desktop release packaging so installed builds include the `node-pty` runtime required by the Electron main process terminal integration.

## [0.1.0-alpha.1] - 2026-03-22

First alpha release of Sentinel.

### Added

- **AI Chat** — Multi-model conversations with OpenAI, Anthropic, Google Gemini, and Vertex AI. Streaming responses, message branching, and follow-up queuing.
- **Workspaces** — Project-based thread organization tied to local directories. Open projects in your IDE, terminal, or file manager.
- **Plan Mode** — Structure conversations as task lists with status tracking (pending, in-progress, completed, blocked) and subtask support.
- **Automations** — Schedule recurring AI workflows with hourly, daily, weekly, weekday, and custom cron triggers. Track run history and status.
- **Semantic Memory** — Vector-based memory (sqlite-vec) for cross-conversation recall. Configurable retention and retrieval settings.
- **Integrations** — Connect 11 external services:
  - Email & Productivity: Gmail, Google Calendar, Google Drive, Notion, Airtable
  - Communication: Slack
  - Development: GitHub, Linear
  - Databases: PostgreSQL, MySQL, MongoDB
- **MCP Support** — Model Context Protocol servers via stdio and HTTP transports. Built-in catalog (Linear, Notion, Figma, Git, Playwright) plus custom server configuration.
- **Skills System** — Install, manage, and run custom skill packs from a local registry.
- **Web Search** — Exa and SearXNG search providers with configurable settings.
- **Rich Chat Composer** — TipTap-based editor with file attachments, model/mode selection, reasoning effort control, and workspace targeting.
- **Code & Diff Rendering** — Syntax-highlighted code blocks (Shiki + Highlight.js), file previews, and diff views with language-aware icons.
- **Approval System** — Request user approval before executing potentially dangerous tool operations.
- **Personalization** — Personality presets (friendly, pragmatic, analytical, mentor), custom instructions, and appearance theming.
- **Desktop App** — Electron 40 shell for macOS, Windows, and Linux with native file/directory pickers, local server lifecycle, and auto-update support.
- **Local-First Architecture** — SQLite database with Drizzle ORM, encrypted at rest. All data stored on the user's machine.
- **CI/CD** — GitHub Actions workflows for testing, type checking, and multi-platform release builds.

### Known Limitations

- Code signing is disabled — macOS Gatekeeper and Windows SmartScreen will show warnings on first launch.
- No auto-update server configured yet — updates require manual download.
- OAuth integrations require `SENTINEL_APP_URL` to be set when using HTTPS redirect URIs (e.g., via ngrok).

# Sentinel

Sentinel is a local-first AI desktop workspace for running serious work across models, tools, memory, and automations on your own machine.

It is built for people who want the reach of modern AI systems without handing the workflow to a browser tab or a hosted black box. Conversations, workspace context, connected tools, and recurring workflows live in one desktop environment with local state and explicit user control.

> **Status:** Alpha. The product is usable, but the surface area is still moving.

## Why Sentinel

Most AI products are either chat wrappers or cloud control planes. Sentinel is built around a different operating model: keep the assistant close to the work, keep the data path legible, and keep execution under the user's control.

That means local state, workspace-aware context, explicit tool access, support for multiple model providers, and a desktop environment built for ongoing work rather than one-off prompts.

## Core Capabilities

### Work across models, not inside one vendor

Sentinel can run against multiple model providers in the same product, so the workspace does not need to be shaped around a single API or a single company’s roadmap.

It can also use the Codex and Claude Code runtimes already configured on the machine, so users can bring their own subscriptions instead of routing every workflow through a separate provider setup inside Sentinel.

### Connect the assistant to real systems

Sentinel can operate across email, calendars, files, repositories, databases, team tools, and web search. The point is not to collect integrations for a settings page. It is to let the assistant work where the task already lives.

### Keep context attached to the workspace

Threads are organized around workspaces, not just chats. Sentinel can retain structured memory, recover relevant context, and keep project-specific state closer to the working directory.

### Move from chat to execution

Sentinel supports structured planning, approvals, task breakdowns, and recurring automations. It is meant for workflows that continue over time, not for generating a response and disappearing.

### Extend the runtime without forking the product

MCP support and installable skills make it possible to extend the environment without rewriting the core app for every new capability.

## Operating Model

Sentinel combines conversation, tool use, planning, memory, and automation in one desktop runtime.

A typical workflow starts with a thread tied to a workspace. From there, the assistant can reason across project files, use connected tools, propose plans, operate under approval controls, save useful context to memory, and hand repeated work off to scheduled automations. The goal is not “chat with AI.” It is a stable operating environment for AI-assisted work.

Local data is stored on the machine. Sentinel uses a local database and supports encryption at rest for persisted state.

## What Sentinel Covers Today

- Multi-provider AI chat and model routing
- Support for locally configured Codex and Claude Code runtimes
- Workspace-based threads and project context
- Structured plan mode with tasks and follow-up questions
- Recurring automations for repeated workflows
- Semantic memory with workspace-aware recall
- Connected integrations across work tools and data systems
- MCP support for external tool runtimes
- Skills for extending behavior and workflows
- Web search support

## Run Locally

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

Sentinel runs locally on `http://localhost:3232` during development.

`ENCRYPTION_KEY` can be left empty in `.env`; it is generated automatically on first desktop launch unless you want to set it yourself.

## Build

```bash
bun run build:desktop:mac
bun run build:desktop:windows
bun run build:desktop:linux
```

For signed macOS release builds, see [docs/macos-signing.md](/Users/mohamedachaq/rework/cronacl-saas/sentinel/docs/macos-signing.md).

## Contributing

Contributor workflow is intentionally light. Conventional commits, local hooks, and release automation are already wired into the repo.

# Sentinel Docs

Sentinel is a desktop app for working with AI inside a real codebase.

The docs are split by how the product is put together:

- the product model
- getting started
- day-to-day workflows
- configuration
- runtime internals
- product decisions
- plain reference

## If you're new here

- [What Sentinel is](./overview/what-is-sentinel.md)
- [How Sentinel is shaped](./overview/how-sentinel-is-shaped.md)
- [Quickstart](./getting-started/quickstart.md)
- [Workspaces and threads](./workflows/workspaces-and-threads.md)

## The sections

### Overview

- [Overview](./overview/index.md)
- [What Sentinel is](./overview/what-is-sentinel.md)
- [How Sentinel is shaped](./overview/how-sentinel-is-shaped.md)
- [Core concepts](./overview/core-concepts.md)

### Getting started

- [Getting started](./getting-started/index.md)
- [Install and run](./getting-started/install.md)
- [Quickstart](./getting-started/quickstart.md)
- [First workspace and thread](./getting-started/first-workspace-and-thread.md)

### Workflows

- [Workflows](./workflows/index.md)
- [Workspaces and threads](./workflows/workspaces-and-threads.md)
- [Chat and plan mode](./workflows/chat-and-plan-mode.md)
- [Repo workflow](./workflows/repo-workflow.md)
- [Terminal and browser](./workflows/terminal-and-browser.md)
- [Approvals and sub-agents](./workflows/approvals-and-subagents.md)
- [Automations in practice](./workflows/automations-in-practice.md)

### Configuration

- [Configuration](./configuration/index.md)
- [Providers and models](./configuration/providers-and-models.md)
- [Search, voice, images, and videos](./configuration/search-voice-and-media.md)
- [Memory, security, and data](./configuration/memory-security-and-data.md)
- [Integrations and MCP](./configuration/integrations-and-mcp.md)
- [Skills](./configuration/skills.md)

### Engines and runtime

- [Engines and runtime](./engines-and-runtime/index.md)
- [Sentinel engine](./engines-and-runtime/sentinel-engine.md)
- [Thread state](./engines-and-runtime/thread-state.md)
- [Context compaction](./engines-and-runtime/context-compaction.md)
- [Codex runtime](./engines-and-runtime/codex-runtime.md)
- [Claude Code](./engines-and-runtime/claude-code.md)
- [Sub-agents](./engines-and-runtime/subagents.md)
- [Repo state and checkpoints](./engines-and-runtime/repo-state-and-checkpoints.md)
- [Generated media](./engines-and-runtime/generated-media.md)

### Product decisions

- [Product decisions](./product-decisions/index.md)
- [Why workspaces and threads](./product-decisions/why-workspaces-and-threads.md)
- [Why plan mode](./product-decisions/why-plan-mode.md)
- [Why approvals](./product-decisions/why-approvals.md)
- [Why automations](./product-decisions/why-automations.md)
- [Why local-first](./product-decisions/why-local-first.md)
- [Why separate extension systems](./product-decisions/why-separate-extension-systems.md)

### Reference

- [Reference](./reference/index.md)
- [Engines, providers, and integrations](./reference/engines-providers-and-integrations.md)
- [Environment and build](./reference/environment-and-build.md)
- [Glossary](./reference/glossary.md)
- [Release and signing](./reference/release-and-signing.md)

## A good reading order

1. [What Sentinel is](./overview/what-is-sentinel.md)
2. [How Sentinel is shaped](./overview/how-sentinel-is-shaped.md)
3. [Quickstart](./getting-started/quickstart.md)
4. [Workspaces and threads](./workflows/workspaces-and-threads.md)
5. [Repo workflow](./workflows/repo-workflow.md)
6. [Providers and models](./configuration/providers-and-models.md)
7. [Sentinel engine](./engines-and-runtime/sentinel-engine.md)
8. [Why workspaces and threads](./product-decisions/why-workspaces-and-threads.md)

## Other docs in the repo

These are still useful and stay at the root `docs/` level:

- [Release process](../release-process.md)
- [macOS signing](../macos-signing.md)
- [Desktop platform smoke checklist](../desktop-platform-smoke-checklist.md)

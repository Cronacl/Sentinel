# Glossary

## Workspace

A local project container in Sentinel. Usually backed by a folder on disk. Threads belong to a workspace.

## Thread

The main unit of work in the app. A thread stores messages, mode, engine, model state, queued follow-ups, and repo-related state.

## Chat mode

The default conversational work mode for a thread.

## Plan mode

A structured thread mode with a stored plan document, tracked tasks, and question sets.

## Engine

The runtime layer used for a thread. Sentinel supports `sentinel`, `codex`, and `claude`.

## Provider

The credential and connection layer for AI model access, such as OpenAI or Anthropic.

## Model

A concrete model ID used through an engine and provider setup.

## Worktree

A repo checkout path associated with a thread so work can stay isolated from the main local checkout.

## Checkpoint

A saved repo state tied to thread history so earlier work can be restored or branched from.

## Approval

A confirmation step required before a tool or group of tools can run.

## Approval policy

The rule set attached to a thread runtime that decides when the runtime must stop and ask before acting.

## Sandbox mode

The access level a runtime gets when it is acting on the local machine.

## Skill

An installable capability pack that extends Sentinel, Claude, or Codex behavior.

## MCP server

A Model Context Protocol server connected to Sentinel over STDIO or HTTP.

## Integration

A built-in external system connection such as GitHub, Gmail, or PostgreSQL.

## Automation

A recurring prompt tied to a workspace and runtime configuration that runs on a schedule.

## Sub-agent

A delegated run linked back to a parent thread and stored with its own child state.

## Project mode

The repo mode a thread is using, usually the main project checkout or a thread worktree.

## Generated media

Image or video output produced through the app's media generation paths and served back to the UI as temporary artifacts.

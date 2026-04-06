# Core concepts

These are the terms that show up everywhere in Sentinel.

## Workspace

A workspace is the project container.

It usually points at a local folder on disk.

## Thread

A thread is the unit of work.

It keeps messages and the rest of the state around the task.

## Engine

An engine is the runtime layer for a thread.

Sentinel supports `sentinel`, `codex`, and `claude`.

## Chat mode

Chat mode is the normal back-and-forth thread mode.

## Plan mode

Plan mode stores a plan document, tasks, and question sets as thread state.

## Worktree

A worktree is a separate repo checkout path tied to a thread.

## Checkpoint

A checkpoint is saved repo state tied to thread history.

## Approval

An approval is a pause before a tool or tool group runs.

## Sub-agent

A sub-agent is delegated work stored as child thread state.

## Skill

A skill is an installable package of behavior or instructions.

## MCP server

An MCP server is an external tool server connected over `stdio` or `http`.

## Integration

An integration is a built-in connection to an outside system.

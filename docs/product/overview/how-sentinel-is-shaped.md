# How Sentinel is shaped

Sentinel is built around a few pieces that stay in view while you work.

## The shell

The shell stays around the task:

- left sidebar for workspaces and threads
- center pane for the active thread
- bottom panel for the terminal
- right sidebar for diffs, PR state, browser tabs, and child threads

The thread is the center, but it is not alone.

## The thread

A thread is where the work happens.

Messages live there, but so does the state around the task:

- engine
- model
- mode
- repo state
- approvals
- queued follow-ups
- plan state

## The workspace

The workspace gives the thread a project to live in.

That usually means a local folder and often a repo.

Once that root path is there, Sentinel can do more:

- inspect repo state
- open terminals in the right place
- use worktrees
- keep thread-level project context

## The runtime around the model

The app is doing more than passing messages to a model.

It is also carrying:

- tools
- prompt context
- memory
- approvals
- MCP
- integrations
- repo checkpoints
- stream state

That is most of what the Sentinel harness is for.

## The general posture

The app leans toward local, stateful work.

That shows up in:

- desktop-first behavior
- local repo awareness
- local runtimes for Codex and Claude
- local backups and local state
- thread history tied to actual project work

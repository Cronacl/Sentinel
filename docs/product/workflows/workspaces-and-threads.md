# Workspaces and threads

Workspaces and threads are the two core objects in Sentinel.

## Workspaces

A workspace is usually a local project folder.

It stores:

- the name and description
- the local root path
- whether it is selected
- whether it is archived
- an optional permission mode override

Threads live inside a workspace. A workspace can be archived, selected, renamed, or updated. Archived workspaces cannot take new threads.

## Threads

A thread is the main unit of work in the app.

It stores:

- title and summary
- chat engine
- selected model
- reasoning effort
- mode: `chat` or `plan`
- current status
- message history
- queued follow-ups
- repo-related state in the engine state

Threads can be pinned, renamed, archived, and reopened later.

## How thread lists work

Sentinel can organize threads in two ways:

- by workspace
- chronologically

Thread lists can also sort by:

- created time
- updated time

Pinned state is tracked separately, and linked pull request state can be shown on thread entries.

## Starting a new thread

The home screen is already a draft thread screen.

The app opens straight into a draft thread flow where you can:

- choose the active workspace
- create a workspace if needed
- choose engine and model
- choose `chat` or `plan`
- choose local or worktree-backed project mode for draft setup
- send the first message and let the thread become persistent

## Thread state over time

Sentinel keeps more thread state than a basic chat app.

That includes:

- message history
- queued follow-ups
- repo checkpoint pointers
- linked PR data
- branch and worktree data
- plan document and plan tasks

That is why a thread feels closer to a work session than a plain conversation.

## Thread switching

Switching threads is repo-aware.

If moving from one thread to another would cause trouble because of dirty repo state, Sentinel can inspect that switch first and ask how to handle it. The two handoff strategies in the repo layer are:

- migrate the changes
- stash the changes

This is part of why threads are treated like repo-linked work contexts.

## Good next reads

- [Chat and plan mode](./chat-and-plan-mode.md)
- [Repo workflow](./repo-workflow.md)
- [Approvals and sub-agents](./approvals-and-subagents.md)

# Repo workflow

The repo is part of the thread.

## What the repo layer does

When a workspace points at a local repo, Sentinel can inspect repo state and use it in the thread.

That includes:

- current branch
- git status
- staged and unstaged changes
- branch diffs
- linked pull request state
- worktree state
- checkpoint state tied to the thread

## Repo actions in a thread

From the thread UI, Sentinel can expose actions for:

- opening the project in an editor or terminal target
- opening the built-in browser
- showing repo diffs
- generating commit messages
- committing changes
- pushing the current branch
- creating a branch
- creating or linking a pull request

The app keeps polling repo context while the thread is active, especially when the repo surface is open.

## Branches and worktrees

Sentinel supports both local project mode and thread worktrees.

That matters when:

- the current checkout is not the one the thread expects
- there are dirty changes and you want isolation
- you want a thread to keep its own branch and path

Worktrees are a normal part of the workflow here.

## Checkpoints

Repo checkpoints are tied to thread history.

The checkpoint flow is simple:

- a thread message can become a repo checkpoint anchor
- the repo state can be captured there
- later, you can reset back to that point
- you can also reapply a later checkpoint path and continue from there

This makes it easier to branch the work without losing the thread history that led to it.

## Pull request state

The thread engine state can store linked pull request information. That lets the UI show:

- the active linked PR
- compare links
- PR status in the sidebar
- PR-related actions from the thread action bar

## Limits to keep in mind

This part of the product works best when the workspace has a valid local root path and the app is running in desktop mode.

Without that, Sentinel still works as a thread-based AI app, but the repo-native parts get thinner.

## Related pages

- [Terminal and browser](./terminal-and-browser.md)
- [Approvals and sub-agents](./approvals-and-subagents.md)

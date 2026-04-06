# Why local-first

Sentinel is built around a local machine and a local repo.

That choice leaks into almost every useful part of the app.

## What local-first changes

It means the app can stay close to:

- the repo
- the terminal
- worktrees
- local runtimes
- desktop permissions
- local state and backups

That is how the repo-aware workflow works in practice.

## What the app stores locally

The main state lives locally:

- SQLite data
- local profile state
- encrypted credentials and config
- generated media artifacts
- backup files

## Tradeoffs

This shape is stronger for real project work.

It also means some features make less sense outside the desktop runtime or without a valid local workspace path. The app still works there, but the deeper workflow gets thinner.

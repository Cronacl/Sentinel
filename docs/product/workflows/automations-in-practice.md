# Automations

Automations are recurring prompts that run inside Sentinel.

They are tied to a workspace and create real automation runs with thread history behind them.

## What an automation includes

An automation stores:

- title
- prompt
- workspace
- chat engine
- model ID
- reasoning effort
- status
- schedule configuration
- next run time

Runs are stored separately and can link back to the thread created by that run.

Automations can use any configured chat engine: `sentinel`, `codex`, `claude`, `copilot`, `cursor`, or `opencode`.

## Schedule types

The app supports these schedule types:

- `hourly`
- `daily`
- `weekly`
- `weekdays`
- `custom`

Custom schedules use a cron expression.

## Status

Automations are created in `paused` state by default.

From the automations UI you can:

- create an automation
- edit it
- pause it
- resume it
- trigger it immediately
- inspect recent runs

## Workspace rules

Automations need a valid workspace.

Archived workspaces cannot be used for automations.

## Templates

The automations screen includes built-in templates to help start common recurring tasks faster.

## Why people use them

Automations are useful when the same prompt keeps coming back. You keep the workspace and runtime setup, and Sentinel keeps creating runs from there.

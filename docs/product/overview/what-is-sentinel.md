# What Sentinel Is

Sentinel is a desktop app for doing software work with AI inside a local project.

A few ideas shape the app:

- the workspace is a real local folder
- the thread is the main unit of work
- repo state matters
- long tasks need more than a prompt box

The app keeps the thread close to the repo, the model, the runtime, the terminal, the diff, and the rest of the task context.

## The basic shape

A workspace points at a local project directory.

Inside that workspace, you start threads. A thread can be a normal chat or a plan. While you work, Sentinel can keep track of repo state, approvals, follow-ups, checkpoints, model selection, and other state around the thread.

The shell stays around that work:

- left sidebar for workspaces and threads
- center pane for the active thread
- bottom panel for the terminal
- right sidebar for diffs, PR context, browser tabs, and sub-agent views

## What Sentinel includes

- workspace-based project organization
- persistent threads
- chat mode and plan mode
- repo-aware actions
- built-in terminal
- built-in browser
- approvals
- multiple AI engines and providers
- voice input
- memory
- automations
- skills
- MCP servers
- integrations

## Engines

Sentinel supports three engines:

- `sentinel`
- `codex`
- `claude`

`sentinel` is the built-in app-managed engine. It handles the app side of the workflow around the model, including things like tool routing, plan mode state, approvals, memory retrieval, integrations, and repo checkpoints.

`codex` and `claude` are local runtime options that still run inside the Sentinel shell.

## The Sentinel harness

The `sentinel` engine is the app harness.

This is the part that holds the thread together while a run is happening. It is where the app wires in things like:

- workspace discovery
- prompt context
- tool routing
- MCP and integration loading
- memory retrieval and autosave
- plan state
- repo checkpoints
- queued follow-ups
- thread status and streamed events

This is one of the heavier parts of the product.

## Claude Code and Codex

`claude` and `codex` are separate runtimes with their own thread state inside Sentinel.

For Codex, the app tracks things like:

- Codex thread ID
- sandbox mode
- approval policy
- reasoning effort
- working directory

For Claude, the app tracks things like:

- Claude session ID
- permission mode
- model
- working directory

Sentinel still owns the app shell around both of them. The thread list, repo panels, approvals, settings, and workspace state stay in Sentinel.

## Where it fits

Sentinel makes the most sense when the work is tied to a real repo and takes more than a few prompts.

It helps most when:

- you want threads that keep project context over time
- you care about diffs, approvals, and repo state
- you want a built-in terminal and browser nearby
- you want recurring tasks or saved memory around a workspace

If you only want a fast chat window, Sentinel is probably more app than you need.

# Quickstart

This is the shortest path to a working local Sentinel setup.

## 1. Install dependencies

Sentinel uses Bun.

```bash
bun install
```

## 2. Create a local env file

```bash
cp .env.example .env
```

You can leave `ENCRYPTION_KEY` empty. Sentinel will generate one on first desktop launch.

## 3. Start the desktop app

```bash
bun run dev:desktop
```

The app runs at `http://localhost:3232`.

## 4. Add a workspace

Once the app is open:

1. add a workspace
2. point it at a local project folder
3. select it in the sidebar

That gives Sentinel a real local place to work from.

## 5. Start a thread

From the home screen:

1. start a new thread
2. pick an engine and model
3. choose chat mode or plan mode
4. send the first message

That is where the app starts to make sense.

## 6. Connect providers if needed

If you want hosted models, configure providers in Settings:

- Providers
- Models
- Voice
- Search

If you want local runtime options, configure Codex or Claude in the app as well.

## 7. Use the built-in workflow

Inside a thread you can:

- read files
- attach documents
- ask for a plan
- approve tool calls
- run commands in the terminal
- inspect diffs
- commit and push changes

## A few things worth knowing early

- Sentinel is desktop-first.
- The app is most useful when a workspace points at a real local repo.
- Some features stay quiet until the workspace has a valid root path.
- Memory is optional and off by default.

## Next pages

- [What Sentinel is](../overview/what-is-sentinel.md)
- [First workspace and thread](./first-workspace-and-thread.md)
- [Workspaces and threads](../workflows/workspaces-and-threads.md)
- [Repo workflow](../workflows/repo-workflow.md)
- [Configuration](../configuration/index.md)

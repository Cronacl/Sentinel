# Claude Code

Sentinel can also use the local Claude Code runtime inside the same shell.

Sentinel drives it through the Claude Agent SDK, which runs the `claude` CLI installed on your machine. Install and sign-in live in Settings → Engines. See [Engines by agent](./agents.md#claude).

The model runtime changes, but the thread model and app shell stay where they are.

## What Sentinel keeps for a Claude thread

A Claude-backed thread can carry:

- Claude session ID
- permission mode
- working directory
- model
- the engine instance it runs on

That is enough for Sentinel to reopen the thread and keep the runtime connection lined up with the rest of the thread state.

The split is close to Codex, but a little simpler.

Sentinel keeps the durable thread record. Claude Code keeps the active local session.

When the thread cannot resume its session, for example because the instance's home changed, Sentinel starts a new session and sends the thread's recent transcript with the first prompt.

## Permission mode

Claude threads support two permission modes:

| Sentinel mode | Claude permission mode |
| ------------- | ---------------------- |
| `default`     | `default`              |
| `full`        | `bypassPermissions`    |

That permission mode lives alongside the rest of the thread runtime state, so the app can keep it attached to the thread instead of treating it as a temporary session flag.

That permission mode affects how the runtime can act during a run, especially when the thread is touching the local machine.

## Plan mode

Claude has its own plan mode, and Sentinel uses it.

Switching a thread between plan and chat starts a new Claude session. Sentinel sends the transcript with the first prompt of that session, so "Implement plan" keeps the context of the planning turns.

## Model handling

Sentinel asks the local Claude setup for runtime status and available models.

If the local runtime responds normally, the app uses those runtime models directly.

The engine manifest fills in what Claude Code does not report: context windows, reasoning effort levels (up to Max where Claude Code reports it), and fast mode on the models that have it.

If the binary is present but the model discovery call times out, Sentinel can still surface fallback model entries so the thread UI does not stall out.

That fallback matters for the same reason it matters on Codex: local runtime checks can be a little uneven.

So here too, the app is trying to keep the thread stable even when runtime discovery is slower than the main UI expects.

## Usage, slash commands, and skills

- Usage limits come from Claude Code's usage request and its live rate-limit events. They show in Settings → Engines and as a chip in the composer.
- The slash menu lists the commands Claude Code reports when it starts.
- Skills in `.claude/skills` or in the instance's home are sent as Claude Code's `/name` command.

## Run shape

Claude Code sits in roughly the same product position as Codex:

```mermaid
sequenceDiagram
    participant UI as Sentinel UI
    participant ST as Sentinel thread
    participant CL as Claude Code runtime

    UI->>ST: Start run on a Claude thread
    ST->>CL: Resolve linked Claude session and send request
    CL-->>ST: Stream output and runtime state
    ST-->>UI: Stream messages, status, approvals, snapshots
```

The main difference is the runtime state surface. The outer product shape stays the same.

The session record is smaller than the Codex one, but the pattern is the same:

1. Resolve the saved Claude-linked thread state.
2. Send the current turn into the Claude session.
3. Stream output and status back through the thread.
4. Persist the updated state in Sentinel around the runtime.

## What stays in Sentinel

Even when Claude Code is running the thread, Sentinel still owns:

- the thread list
- the workspace state
- the repo panels
- the shell
- settings

So the runtime changes, but the rest of the product stays steady.

## Code references

- [`state/claude.ts`](../../../src/lib/ai/chat/engines/state/claude.ts)
- [`claude/run.ts`](../../../src/lib/ai/chat/runtime/claude/run.ts)
- [`drivers/claude.ts`](../../../src/lib/ai/chat/engines/drivers/claude.ts)

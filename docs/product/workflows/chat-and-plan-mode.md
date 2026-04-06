# Chat and plan mode

Sentinel threads run in one of two modes: `chat` or `plan`.

They sit close to each other in the UI, but they do different jobs.

## Chat mode

Chat mode is the default working mode.

Use it when you want the model to inspect code, answer questions, make changes, run tools, or keep moving through a task.

Inside a normal thread, chat mode supports:

- streaming responses
- file and document attachments
- model and engine selection
- queued follow-ups while a run is busy
- tool approvals
- message editing
- branch-aware thread history

## Plan mode

Plan mode is built into the app as its own mode.

The app stores structured plan state for a thread. That includes:

- a title
- a summary
- a goal
- a full document
- an audience
- a task list
- question sets that can be answered later

Plan tasks have tracked status values:

- `pending`
- `in_progress`
- `completed`
- `blocked`

Question sets also have tracked status values.

## When to use plan mode

Plan mode makes sense when the task needs shape before implementation.

Some obvious examples:

- changing architecture
- rolling out a larger feature
- working through migration steps
- breaking a task into tracked subtasks
- getting clarifying questions out before touching code

## Composer controls

The composer does more than send text.

Depending on the thread state and workspace state, it can also handle:

- engine and model selection
- plan or chat mode selection
- reasoning effort
- attachments
- workspace file suggestions
- skill suggestions
- voice input
- permission mode display
- branch switching and project mode setup

## Follow-ups and long runs

If a run is active, Sentinel can queue a follow-up instead of forcing you to wait and start over.

Thread status can move through:

- `idle`
- `streaming`
- `awaiting_approval`

That status lives in the normal thread state.

## Good next reads

- [Repo workflow](./repo-workflow.md)
- [Approvals and sub-agents](./approvals-and-subagents.md)

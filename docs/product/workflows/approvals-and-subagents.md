# Approvals and sub-agents

Once the tasks get bigger, two workflow pieces start to matter more:

- approvals
- sub-agent threads

## Approvals

Tool approvals are part of the runtime model.

When a tool or tool group needs confirmation, a thread can pause in `awaiting_approval` until you respond.

Approval settings can be controlled at two levels:

- global permission mode
- per-tool or per-group approval rules

The approvals settings screen groups tools by area and lets you require approval or let them run immediately.

That is especially useful when you want different behavior for:

- built-in local tools
- integrations
- higher-risk actions

## Security and permission mode

Sentinel also has a broader security setting for permission mode.

The visible choices are:

- `default`
- `full`

Workspace-level permission overrides can also exist, so a workspace can differ from the global default.

## Sub-agent threads

Sentinel has explicit support for sub-agent threads:

- a parent thread can resolve a child thread
- child work is tied to its own thread state
- child work can show up in its own panel
- sub-agent threads can stream
- they can hit tool approvals
- they can surface plan questions

Delegated work stays visible and reviewable.

Under the hood, Sentinel treats delegated work as thread state. That is why the app can keep approvals, run state, and summaries attached to the child work.

## When this starts to matter

Once the app is doing more than simple Q&A, you need both of these systems.

Approvals keep the tool side sane.

Sub-agent threads keep delegated work visible.

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

Sentinel stores four permission modes:

- `default`: tools are limited to the selected workspace directory
- `accept_edits`: file edits are applied without asking; other actions still ask
- `auto`: the agent decides which actions need your approval
- `full`: tools can access any path on this machine

Each engine supports a subset, and the composer only offers that subset. The built-in engine, Claude, Codex, and Copilot support `default` and `full`. See [Engines by agent](../engines-and-runtime/agents.md) for the rest.

If a stored mode is not supported by the thread's engine, Sentinel uses the most permissive supported mode that is not above it. Sentinel never grants more than you chose.

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

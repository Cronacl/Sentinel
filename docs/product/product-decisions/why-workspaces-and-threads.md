# Why workspaces and threads

This split shows up everywhere in Sentinel, so it is worth calling out directly.

## Why workspaces exist

The workspace is the project container.

It gives the app somewhere stable to keep:

- a local root path
- thread groups
- workspace-level settings
- automations
- permission overrides

Without that, every thread would have to rediscover the project shape from scratch.

## Why threads exist

The thread is the unit of work.

That is where the app keeps:

- messages
- engine choice
- model choice
- plan state
- queued follow-ups
- repo state
- checkpoint state

This ends up fitting software work pretty well. Tasks come and go. The project stays around.

## Why the split matters

It lets the app keep long-running work tied to a project without turning the whole project into one giant transcript.

That is the real reason the split is there.

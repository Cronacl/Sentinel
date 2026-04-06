# Why separate extension systems

Sentinel has three extension layers:

- skills
- MCP servers
- integrations

They are close to each other in the UI, but they do different jobs.

## Skills

Skills are the lighter path.

They are mostly packaged behavior and instructions.

## MCP servers

MCP is the tool-server path.

That is where Sentinel can connect to outside tool servers over `stdio` or `http`.

## Integrations

Integrations are app-owned connections to outside systems.

Those have built-in setup flows, stored credentials, and provider-specific tool surfaces.

## Why keep the split

Flattening all three into one thing would make setup and ownership fuzzy.

Keeping them separate makes it easier to know what kind of extension you are using and which part of the app owns it.

# MCP and integrations

Sentinel has two different extension layers here:

- MCP servers
- integrations

They are related, but they solve different jobs.

## MCP servers

MCP support is built into the app.

Users can add:

- catalog-backed servers
- custom STDIO servers
- custom HTTP servers

The app supports:

- create and edit
- enable and disable
- delete
- config validation
- encrypted config storage
- OAuth flow for supported HTTP MCP servers

The curated MCP catalog in the code currently includes a small set of entries, including Git and Playwright.

## Integrations

Integrations connect Sentinel to external systems the app can act on directly.

The current provider list includes:

- Gmail
- Google Calendar
- Google Drive
- Airtable
- Slack
- Notion
- GitHub
- Linear
- PostgreSQL
- MySQL
- MongoDB
- Yahoo Finance
- arXiv
- PubMed

## Integration auth types

Depending on the provider, an integration can use:

- OAuth
- connection config
- no auth

The integrations settings UI reflects that split. Database providers open one setup flow, OAuth providers use another, and authless providers can be enabled directly.

## Practical difference

Use MCP when you want a server-shaped protocol integration.

Use the integrations system when Sentinel already has a built-in workflow for that external system.

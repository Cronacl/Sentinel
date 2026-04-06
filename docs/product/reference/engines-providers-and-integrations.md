# Engines, providers, and integrations

This page is the short version.

The deeper runtime mechanics live in `Engines and runtime`.

## Engines

Sentinel currently supports three chat engines:

| Engine     | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `sentinel` | Built-in harness and built-in engine path                      |
| `codex`    | Local Codex runtime carried inside Sentinel thread state       |
| `claude`   | Local Claude Code runtime carried inside Sentinel thread state |

## Model providers

Current AI provider support:

- OpenAI
- Anthropic
- Google AI Studio
- Google Vertex AI
- xAI
- Azure OpenAI
- Amazon Bedrock
- Groq
- Cohere
- Moonshot AI
- Mistral
- Ollama
- OpenRouter
- Vercel AI Gateway

## Search providers

- Exa
- SearXNG

## Voice transcription providers

- OpenAI
- Groq
- Azure

## Integration providers

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

## MCP transports

- `stdio`
- `http`

## Related pages

- [Sentinel engine](../engines-and-runtime/sentinel-engine.md)
- [Thread state](../engines-and-runtime/thread-state.md)
- [Codex runtime](../engines-and-runtime/codex-runtime.md)
- [Claude Code](../engines-and-runtime/claude-code.md)
- [Integrations and MCP](../configuration/integrations-and-mcp.md)

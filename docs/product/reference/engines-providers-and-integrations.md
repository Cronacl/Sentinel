# Engines, providers, and integrations

This page is the short version.

The deeper runtime mechanics live in `Engines and runtime`.

## Engines

Sentinel supports ten chat engines:

| Engine        | Meaning                                                               | Transport  |
| ------------- | --------------------------------------------------------------------- | ---------- |
| `sentinel`    | Built-in harness and built-in engine path                             | AI SDK     |
| `claude`      | Local Claude Code, through the Claude Agent SDK                       | SDK        |
| `codex`       | Local Codex CLI, through its app server                               | App server |
| `copilot`     | GitHub Copilot, through the Copilot SDK and its bundled runtime       | SDK        |
| `cursor`      | Local Cursor Agent                                                    | ACP        |
| `opencode`    | Local OpenCode 1.x or 2.x, through its HTTP server                    | HTTP       |
| `grok`        | Local Grok Build agent (experimental)                                 | ACP        |
| `antigravity` | Google Antigravity's ACP server, installed by Sentinel (experimental) | ACP        |
| `pi`          | Local Pi coding agent (experimental)                                  | RPC        |
| `acp`         | Agents from the ACP Registry, or any ACP command (experimental)       | ACP        |

Every engine except `sentinel` can have several instances. See [Engines by agent](../engines-and-runtime/agents.md) for what each one supports.

## Model providers

Chat model providers for the `sentinel` engine:

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
- Mistral AI
- DeepSeek
- Ollama
- OpenRouter
- Vercel AI Gateway

Image and video providers:

- Black Forest Labs
- Kling AI
- ByteDance
- Fal
- Replicate

OpenAI, Google, Vertex AI, and xAI also serve image or video models.

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
- [Engines by agent](../engines-and-runtime/agents.md)
- [Engines settings](../configuration/engines.md)
- [Codex runtime](../engines-and-runtime/codex-runtime.md)
- [Claude Code](../engines-and-runtime/claude-code.md)
- [Integrations and MCP](../configuration/integrations-and-mcp.md)

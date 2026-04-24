# Providers and models

Sentinel separates provider setup from model setup.

It helps to understand that split early.

## Providers

A provider is the connection layer.

Provider settings cover:

- credentials
- encrypted config
- enabled or disabled state

The providers screen is where you connect, edit, enable, disable, or remove a provider.

## What providers are supported

Current provider support includes:

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

## Models

The models screen is where you manage what models are available once a provider is connected.

That includes:

- built-in model catalog entries
- enable and disable state
- custom model IDs
- capability labels
- runtime status for Codex and Claude integrations

## Connected vs enabled

In Sentinel, a configured provider and an enabled model are two different things.

You can:

- connect a provider
- disable that provider
- leave some models enabled and others disabled
- add custom model IDs where supported

## Engines

Sentinel has six engines:

- `sentinel`
- `codex`
- `claude`
- `copilot`
- `cursor`
- `opencode`

The `sentinel` engine is the app-managed runtime.

`codex`, `claude`, `copilot`, `cursor`, and `opencode` are local runtime integrations. The models screen shows runtime status for those engines and includes refresh actions for their availability.

For Codex, Sentinel can also hold onto thread-specific runtime state like sandbox mode, approval policy, and the linked Codex thread ID.

For Claude, Sentinel keeps the linked Claude session state for the thread.

That is why engine choice changes more than the label in the model picker.

## Good next reads

- [Search, voice, images, and videos](./search-voice-and-media.md)
- [Memory, security, and data](./memory-security-and-data.md)
- [Engines, providers, and integrations](../reference/engines-providers-and-integrations.md)

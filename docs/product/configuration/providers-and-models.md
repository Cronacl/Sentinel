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

Sentinel's built-in engine talks to providers through the AI SDK (version 7).

Chat providers:

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

Black Forest Labs, Kling AI, ByteDance, Fal, and Replicate are image and video providers. See [Search, voice, images, and videos](./search-voice-and-media.md).

A few provider details:

- xAI runs on its Responses API with response storage turned off, so xAI does not keep prompts and responses.
- Azure model IDs are deployment names.

## Models

The models screen is where you manage what models are available once a provider is connected.

That includes:

- built-in model catalog entries
- enable and disable state
- custom model IDs
- capability labels
- reasoning options per model

The built-in catalog starts each provider's list with its current flagship, for example Claude Opus 5.5, Sonnet 5.5, and Fable 5.1, GPT-6 and GPT-5.6, Gemini 3.x, Grok 4.x, DeepSeek V4, Kimi K3, and Mistral Large.

Reasoning options follow each provider's own values, such as effort levels for Claude, OpenAI, and Grok, or thinking levels for Gemini.

When a provider retires a model, Sentinel moves threads, automations, and saved defaults that use it to the provider's recommended successor. If you still have the retired ID enabled, for example as a custom model, Sentinel keeps using it.

Retired image and video models move to their replacement the same way.

## Connected vs enabled

In Sentinel, a configured provider and an enabled model are two different things.

You can:

- connect a provider
- disable that provider
- leave some models enabled and others disabled
- add custom model IDs where supported

## Engines

Providers only apply to the `sentinel` engine.

The other engines (Claude, Codex, Copilot, Cursor, OpenCode, Grok Build, Antigravity, Pi, and ACP Registry agents) bring their own models and sign-in. Sentinel asks each one for its models and shows them in the composer. The engine manifest adds metadata such as context windows, reasoning options, and badges when the engine does not report them.

Engine setup lives in Settings → Engines, not on the providers screen. See [Engines settings](./engines.md) and [Engines by agent](../engines-and-runtime/agents.md).

That is why engine choice changes more than the label in the model picker.

## Good next reads

- [Search, voice, images, and videos](./search-voice-and-media.md)
- [Memory, security, and data](./memory-security-and-data.md)
- [Engines, providers, and integrations](../reference/engines-providers-and-integrations.md)

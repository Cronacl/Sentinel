import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateText, type LanguageModel, type ModelMessage } from "ai";

import type { AIProvider } from "@/server/db/enums";

import {
  getModelsForProvider,
  getReasoningProviderOptions,
  getSupportedReasoningEfforts,
} from "./models";

mock.module("server-only", () => ({}));

const { createProviderLanguageModel } = await import("./factory");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type CapturedRequest = {
  body: Record<string, unknown>;
  headers: Headers;
};

type ProviderOptionsRecord = Record<string, Record<string, unknown>>;

// Sends one request through the real provider package and returns what it
// posted. The stubbed API answers with an error; only the request matters.
// This catches provider packages that silently drop an option for some model
// ids (for example @ai-sdk/mistral only sends `reasoning_effort` for model ids
// on its own allow-list).
async function captureRequest(
  model: unknown,
  providerOptions: ProviderOptionsRecord | undefined,
  prompt: { instructions?: string; messages?: ModelMessage[] } = {},
): Promise<CapturedRequest> {
  let captured: CapturedRequest | undefined;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    captured = {
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    };
    return new Response(JSON.stringify({ error: { message: "stubbed" } }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }) as unknown as typeof fetch;

  let failure: unknown;
  await generateText({
    ...(prompt.instructions ? { instructions: prompt.instructions } : {}),
    maxRetries: 0,
    messages: prompt.messages ?? [{ content: "Hello.", role: "user" }],
    model: model as LanguageModel,
    ...(providerOptions
      ? {
          providerOptions: providerOptions as Parameters<
            typeof generateText
          >[0]["providerOptions"],
        }
      : {}),
  }).catch((error: unknown) => {
    failure = error;
  });

  if (!captured) {
    throw new Error(`The provider did not send a request: ${String(failure)}`);
  }
  return captured;
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * For each provider: the request-body field that must carry each provider
 * option Sentinel sets for reasoning. Paths are relative to the provider's
 * options object (`providerOptions[key]`) and to the JSON request body.
 */
const REASONING_FIELD_PATHS: Partial<
  Record<
    AIProvider,
    Array<{ body: readonly string[]; option: readonly string[] }>
  >
> = {
  anthropic: [
    { body: ["output_config", "effort"], option: ["effort"] },
    { body: ["thinking", "type"], option: ["thinking", "type"] },
    { body: ["thinking", "display"], option: ["thinking", "display"] },
    {
      body: ["thinking", "block_binding", "prefix_mismatch_behavior"],
      option: ["thinking", "blockBinding", "prefixMismatchBehavior"],
    },
  ],
  cohere: [{ body: ["thinking", "type"], option: ["thinking", "type"] }],
  deepseek: [
    { body: ["thinking", "type"], option: ["thinking", "type"] },
    { body: ["reasoning_effort"], option: ["reasoningEffort"] },
  ],
  google: [
    {
      body: ["generationConfig", "thinkingConfig", "thinkingLevel"],
      option: ["thinkingConfig", "thinkingLevel"],
    },
    {
      body: ["generationConfig", "thinkingConfig", "thinkingBudget"],
      option: ["thinkingConfig", "thinkingBudget"],
    },
    {
      body: ["generationConfig", "thinkingConfig", "includeThoughts"],
      option: ["thinkingConfig", "includeThoughts"],
    },
  ],
  groq: [{ body: ["reasoning_effort"], option: ["reasoningEffort"] }],
  mistral: [{ body: ["reasoning_effort"], option: ["reasoningEffort"] }],
  moonshotai: [
    { body: ["reasoning_effort"], option: ["reasoningEffort"] },
    { body: ["thinking", "type"], option: ["thinking", "type"] },
  ],
  openai: [
    { body: ["reasoning", "effort"], option: ["reasoningEffort"] },
    { body: ["reasoning", "summary"], option: ["reasoningSummary"] },
  ],
  xai: [{ body: ["reasoning", "effort"], option: ["reasoningEffort"] }],
};

// Vertex shares the Google configs and request format but needs Google auth
// to build a request, so it is covered through the `google` provider.
const PROVIDERS_WITH_REASONING = Object.keys(
  REASONING_FIELD_PATHS,
) as AIProvider[];

describe("reasoning options reach the provider request", () => {
  for (const provider of PROVIDERS_WITH_REASONING) {
    it(`sends every ${provider} effort the picker offers`, async () => {
      const fieldPaths = REASONING_FIELD_PATHS[provider]!;
      const models = getModelsForProvider(provider).filter(
        (model) => getSupportedReasoningEfforts(provider, model.id).length > 0,
      );
      expect(models.length).toBeGreaterThan(0);

      for (const model of models) {
        for (const effort of getSupportedReasoningEfforts(provider, model.id)) {
          const providerOptions = getReasoningProviderOptions(
            provider,
            model.id,
            effort,
          ) as ProviderOptionsRecord | undefined;
          const [optionsKey] = Object.keys(providerOptions ?? {});
          const options = optionsKey ? providerOptions![optionsKey] : undefined;
          expect(options).toBeDefined();

          const { body } = await captureRequest(
            createProviderLanguageModel(
              provider,
              { apiKey: "test-key" },
              model.id,
            ),
            providerOptions,
          );

          let checkedFields = 0;
          for (const path of fieldPaths) {
            const expected = readPath(options, path.option);
            if (expected === undefined) {
              continue;
            }
            checkedFields += 1;
            expect({
              effort,
              field: path.body.join("."),
              model: model.id,
              sent: readPath(body, path.body),
            }).toEqual({
              effort,
              field: path.body.join("."),
              model: model.id,
              sent: expected,
            });
          }
          expect({
            checked: checkedFields > 0,
            effort,
            model: model.id,
          }).toEqual({ checked: true, effort, model: model.id });
        }
      }
    });
  }
});

describe("Claude preserved thinking", () => {
  const PRESERVED_THINKING_MODELS = [
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-fable-5-1",
  ];

  function anthropicModel(modelId: string) {
    return createProviderLanguageModel(
      "anthropic",
      { apiKey: "test-key" },
      modelId,
    );
  }

  // A transcript after Sentinel's context compaction: the summary replaces
  // the older history (it is sent as a system message), and the most recent
  // turns are replayed with their signed thinking blocks. Those blocks were
  // produced under a different prefix, so accounts created on or after
  // 2026-08-31 get a 400 unless the request asks the API to drop them.
  const compactedTranscript = {
    instructions:
      "Context compaction summary\nThe user is refactoring the parser.",
    messages: [
      { content: "Rename the tokenizer.", role: "user" },
      {
        content: [
          {
            providerOptions: { anthropic: { signature: "signature-1" } },
            text: "The tokenizer lives in lexer.ts.",
            type: "reasoning",
          },
          { text: "Renamed it to Lexer.", type: "text" },
        ],
        role: "assistant",
      },
      { content: "Now update the tests.", role: "user" },
    ] satisfies ModelMessage[],
  };

  it("drops stale thinking instead of failing after compaction", async () => {
    for (const modelId of PRESERVED_THINKING_MODELS) {
      const { body, headers } = await captureRequest(
        anthropicModel(modelId),
        getReasoningProviderOptions(
          "anthropic",
          modelId,
          "high",
        ) as ProviderOptionsRecord,
        compactedTranscript,
      );

      expect(body.thinking).toEqual({
        block_binding: { prefix_mismatch_behavior: "drop_block" },
        display: "summarized",
        type: "adaptive",
      });
      expect(headers.get("anthropic-beta") ?? "").toContain(
        "thinking-binding-controls-2026-08-01",
      );
      expect(body.system).toEqual([
        expect.objectContaining({ text: compactedTranscript.instructions }),
      ]);
      // The retained turn still replays its thinking block unchanged.
      expect(readPath(body, ["messages", "1", "content", "0"])).toMatchObject({
        signature: "signature-1",
        type: "thinking",
      });
    }
  });

  it("keeps the opt-out when no effort is selected", async () => {
    const providerOptions = getReasoningProviderOptions(
      "anthropic",
      "claude-opus-5-5",
      null,
    ) as ProviderOptionsRecord;
    expect(providerOptions).toEqual({
      anthropic: {
        thinking: { blockBinding: { prefixMismatchBehavior: "drop_block" } },
      },
    });

    const { body, headers } = await captureRequest(
      anthropicModel("claude-opus-5-5"),
      providerOptions,
      compactedTranscript,
    );

    // No thinking type: the model keeps its default (adaptive) mode.
    expect(body.thinking).toEqual({
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    });
    expect(body.output_config).toBeUndefined();
    expect(headers.get("anthropic-beta") ?? "").toContain(
      "thinking-binding-controls-2026-08-01",
    );
  });

  it("leaves models without conversation binding unchanged", async () => {
    const { body, headers } = await captureRequest(
      anthropicModel("claude-opus-4-8"),
      getReasoningProviderOptions(
        "anthropic",
        "claude-opus-4-8",
        "high",
      ) as ProviderOptionsRecord,
      compactedTranscript,
    );

    expect(body.thinking).toEqual({ display: "summarized", type: "adaptive" });
    expect(headers.get("anthropic-beta") ?? "").not.toContain(
      "thinking-binding-controls",
    );
    expect(
      getReasoningProviderOptions("anthropic", "claude-opus-4-8", null),
    ).toBeUndefined();
  });
});

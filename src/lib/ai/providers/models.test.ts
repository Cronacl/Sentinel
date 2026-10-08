import { describe, expect, it } from "bun:test";

import { AI_PROVIDERS, type AIProvider } from "@/server/db/enums";

import { normalizeSelectedModelId } from "./model-selection";
import {
  MODEL_CATALOG,
  REASONING_EFFORTS,
  findModel,
  getDefaultReasoningEffort,
  getLowestReasoningEffort,
  getModelAttachmentCapabilities,
  getModelsForProvider,
  getReasoningProviderOptions,
  getRetiredCompositeModelReplacement,
  getRetiredModelReplacement,
  getSupportedReasoningEfforts,
  isKnownModel,
  resolveStoredCompositeModelId,
} from "./models";

const CATALOG_PROVIDERS = Object.keys(MODEL_CATALOG) as AIProvider[];

// Model ids that Sentinel listed before the 2026-10 catalog refresh and that
// providers have since shut down, renamed, or that were never valid ids.
const RETIRED_MODEL_IDS: Array<[AIProvider, string]> = [
  ["openai", "gpt-5-codex"],
  ["openai", "gpt-5.1-codex"],
  ["openai", "gpt-5.1-codex-mini"],
  ["openai", "codex-mini-latest"],
  ["openai", "gpt-5-chat-latest"],
  ["openai", "gpt-5.1-chat-latest"],
  ["openai", "gpt-4.1-nano"],
  ["openai", "o1"],
  ["openai", "o3-mini"],
  ["openai", "o4-mini"],
  ["openai", "o4"],
  ["anthropic", "claude-opus-4-1"],
  ["anthropic", "claude-3-7-sonnet-latest"],
  ["anthropic", "claude-3-7-sonnet-20250219"],
  ["anthropic", "claude-3-5-sonnet-20241022"],
  ["anthropic", "claude-3-5-haiku-latest"],
  ["anthropic", "claude-3-5-haiku-20241022"],
  ["anthropic", "claude-4-sonnet-20250514"],
  ["google", "gemini-3-pro-preview"],
  ["google", "gemini-2.0-flash"],
  ["google", "gemini-2.0-flash-001"],
  ["google", "gemini-2.0-flash-lite"],
  ["google", "gemini-1.5-pro"],
  ["google", "gemini-1.5-flash"],
  ["google_vertex", "gemini-3-pro-preview"],
  ["google_vertex", "gemini-2.0-flash"],
  ["google_vertex", "gemini-2.0-flash-001"],
  ["google_vertex", "gemini-2.0-flash-exp"],
  ["google_vertex", "gemini-2.0-flash-lite"],
  ["google_vertex", "gemini-1.5-pro"],
  ["google_vertex", "gemini-1.5-flash"],
  ["vercel", "anthropic/claude-sonnet-4-5"],
  ["vercel", "anthropic/claude-haiku-4-5"],
  ["xai", "grok-4"],
  ["xai", "grok-4-fast-reasoning"],
  ["xai", "grok-4-fast-non-reasoning"],
  ["xai", "grok-3"],
  ["xai", "grok-3-mini"],
  ["amazon_bedrock", "anthropic.claude-3-5-sonnet-20241022-v2:0"],
  ["amazon_bedrock", "anthropic.claude-3-haiku-20240307-v1:0"],
  ["amazon_bedrock", "anthropic.claude-sonnet-4-5-20250929-v1:0"],
  ["groq", "gemma2-9b-it"],
  ["groq", "mixtral-8x7b-32768"],
  ["groq", "qwen-qwq-32b"],
  ["cohere", "command-r-plus"],
  ["cohere", "command-r"],
  ["moonshotai", "kimi-k2.5"],
  ["moonshotai", "kimi-k2"],
  ["moonshotai", "kimi-k2-thinking"],
  ["moonshotai", "moonshot-v1-128k"],
  ["moonshotai", "moonshot-v1-8k"],
  ["mistral", "pixtral-large-latest"],
  ["mistral", "magistral-medium-2507"],
  ["mistral", "magistral-small-2507"],
  ["openrouter", "anthropic/claude-haiku-3.5"],
  ["deepseek", "deepseek-chat"],
  ["deepseek", "deepseek-reasoner"],
];

describe("model catalog", () => {
  it("covers every chat provider", () => {
    expect(CATALOG_PROVIDERS.sort()).toEqual(
      [
        "amazon_bedrock",
        "anthropic",
        "azure",
        "cohere",
        "deepseek",
        "google",
        "google_vertex",
        "groq",
        "mistral",
        "moonshotai",
        "ollama",
        "openai",
        "openrouter",
        "vercel",
        "xai",
      ].sort(),
    );
    for (const provider of CATALOG_PROVIDERS) {
      expect(AI_PROVIDERS).toContain(provider);
    }
  });

  it("starts every provider with its current flagship", () => {
    expect(
      Object.fromEntries(
        CATALOG_PROVIDERS.map((provider) => [
          provider,
          getModelsForProvider(provider)[0]?.id,
        ]),
      ),
    ).toEqual({
      amazon_bedrock: "us.anthropic.claude-opus-5-5",
      anthropic: "claude-opus-5-5",
      // Azure ids are deployment names; gpt-5 is the pre-refresh default.
      azure: "gpt-5",
      cohere: "command-a-plus-05-2026",
      deepseek: "deepseek-v4-pro",
      google: "gemini-3.8-flash",
      google_vertex: "gemini-3.8-flash",
      groq: "openai/gpt-oss-120b",
      mistral: "mistral-large-latest",
      moonshotai: "kimi-k3",
      ollama: "llama3.2",
      openai: "gpt-6-astra",
      openrouter: "anthropic/claude-opus-5.5",
      vercel: "anthropic/claude-opus-5.5",
      xai: "grok-4.7",
    });
  });

  it("keeps ids unique and reasoning configs internally consistent", () => {
    for (const provider of CATALOG_PROVIDERS) {
      const models = getModelsForProvider(provider);
      const ids = models.map((model) => model.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const model of models) {
        expect(model.contextWindow ?? 0).toBeGreaterThan(0);
        if (!model.reasoning) {
          continue;
        }
        expect(model.reasoning.supportedEfforts.length).toBeGreaterThan(0);
        expect(model.reasoning.supportedEfforts).toContain(
          model.reasoning.defaultEffort,
        );
        for (const effort of model.reasoning.supportedEfforts) {
          expect(REASONING_EFFORTS).toContain(effort);
          expect(
            getReasoningProviderOptions(provider, model.id, effort),
          ).toBeDefined();
        }
      }
    }
  });

  it("no longer lists retired model ids", () => {
    for (const [provider, modelId] of RETIRED_MODEL_IDS) {
      expect(isKnownModel(provider, modelId)).toBe(false);
    }
  });

  it("lists the current Anthropic lineup in order", () => {
    expect(
      getModelsForProvider("anthropic")
        .slice(0, 4)
        .map((model) => model.id),
    ).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
      "claude-haiku-4-5",
    ]);
  });

  it("drops the retired Moonshot V1 and Kimi K2.5 models", () => {
    expect(getModelsForProvider("moonshotai").map((model) => model.id)).toEqual(
      ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6"],
    );
  });
});

describe("retired model ids", () => {
  it("map every retired id to a listed successor of the same provider", () => {
    for (const [provider, modelId] of RETIRED_MODEL_IDS) {
      const replacement = getRetiredModelReplacement(provider, modelId);
      expect(replacement).not.toBe(null);
      expect(findModel(provider, replacement!)).toBeDefined();
    }
  });

  it("maps current and unknown ids to nothing", () => {
    expect(getRetiredModelReplacement("openai", "gpt-6-astra")).toBe(null);
    expect(getRetiredModelReplacement("openai", "my-fine-tune")).toBe(null);
    expect(getRetiredModelReplacement("openai", "toString")).toBe(null);
    expect(getRetiredModelReplacement("fal", "anything")).toBe(null);
  });

  it("resolves composite ids, including Bedrock ids that contain colons", () => {
    expect(getRetiredCompositeModelReplacement("deepseek:deepseek-chat")).toBe(
      "deepseek:deepseek-flash",
    );
    expect(
      getRetiredCompositeModelReplacement(
        "amazon_bedrock:anthropic.claude-3-haiku-20240307-v1:0",
      ),
    ).toBe("amazon_bedrock:us.anthropic.claude-haiku-4-5-20251001-v1:0");
    expect(
      getRetiredCompositeModelReplacement("anthropic:claude-opus-5-5"),
    ).toBe(null);
    // Other engines store bare model ids.
    expect(getRetiredCompositeModelReplacement("gpt-5-codex")).toBe(null);
    expect(getRetiredCompositeModelReplacement("codex:gpt-5-codex")).toBe(null);
    expect(getRetiredCompositeModelReplacement(":gpt-5-codex")).toBe(null);
  });

  it("upgrades stored ids unless the user still has the id available", () => {
    const enabled = new Set([
      "anthropic:claude-sonnet-5-5",
      // Re-added as a custom model, e.g. against an endpoint that serves it.
      "openai:gpt-5-codex",
    ]);

    expect(
      resolveStoredCompositeModelId(
        "anthropic:claude-3-7-sonnet-20250219",
        enabled,
      ),
    ).toBe("anthropic:claude-sonnet-5-5");
    expect(resolveStoredCompositeModelId("openai:gpt-5-codex", enabled)).toBe(
      "openai:gpt-5-codex",
    );
    expect(
      resolveStoredCompositeModelId("anthropic:claude-sonnet-5-5", enabled),
    ).toBe("anthropic:claude-sonnet-5-5");
    expect(resolveStoredCompositeModelId("ollama:my-model", enabled)).toBe(
      "ollama:my-model",
    );
    // The successor (claude-opus-5-5) is turned off: keep the stored id so
    // the caller's own fallback applies instead of a model the user disabled.
    expect(
      resolveStoredCompositeModelId("anthropic:claude-opus-4-1", enabled),
    ).toBe("anthropic:claude-opus-4-1");
  });

  it("selects the successor when normalizing a stored default model", () => {
    const availableModels = [
      { modelId: "deepseek-flash", provider: "deepseek" as const },
      { modelId: "claude-haiku-4-5", provider: "anthropic" as const },
    ];

    expect(
      normalizeSelectedModelId("deepseek:deepseek-reasoner", availableModels),
    ).toBe("deepseek:deepseek-flash");
    expect(
      normalizeSelectedModelId(
        "anthropic:claude-3-5-haiku-latest",
        availableModels,
      ),
    ).toBe("anthropic:claude-haiku-4-5");
    // The successor is not enabled: keep the previous "no selection" result.
    expect(
      normalizeSelectedModelId("openai:gpt-5-codex", availableModels),
    ).toBe(null);
    expect(
      normalizeSelectedModelId("anthropic:unknown-model", availableModels),
    ).toBe(null);
  });
});

describe("model attachment capabilities", () => {
  it("returns explicit native file support for known multimodal models", () => {
    expect(getModelAttachmentCapabilities("openai", "gpt-5.2")).toEqual({
      supportsImages: true,
      supportsPdf: true,
      supportsTextFiles: true,
    });
    expect(
      getModelAttachmentCapabilities("anthropic", "claude-opus-5-5"),
    ).toEqual({
      supportsImages: true,
      supportsPdf: true,
      supportsTextFiles: true,
    });
    expect(
      getModelAttachmentCapabilities("google", "gemini-3.8-flash"),
    ).toEqual({
      supportsImages: true,
      supportsPdf: true,
      supportsTextFiles: true,
    });
  });

  it("defaults unknown models to conservative no-file support", () => {
    expect(
      getModelAttachmentCapabilities("openai", "custom-unknown-model"),
    ).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
  });

  it("keeps text-only models and other providers on no-file support", () => {
    expect(getModelAttachmentCapabilities("openai", "o3-mini")).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
    expect(
      getModelAttachmentCapabilities("deepseek", "deepseek-flash"),
    ).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
    expect(getModelAttachmentCapabilities("xai", "grok-4.7")).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
  });
});

describe("DeepSeek model catalog", () => {
  it("lists the V4 models that replaced deepseek-chat and deepseek-reasoner", () => {
    expect(getModelsForProvider("deepseek").map((model) => model.id)).toEqual([
      "deepseek-v4-pro",
      "deepseek-flash",
    ]);
  });

  it("maps reasoning controls to thinking and reasoning effort", () => {
    expect(getDefaultReasoningEffort("deepseek", "deepseek-flash")).toBe(
      "high",
    );
    expect(getSupportedReasoningEfforts("deepseek", "deepseek-flash")).toEqual([
      "none",
      "low",
      "high",
      "xhigh",
    ]);
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-v4-pro", "none"),
    ).toEqual({
      deepseek: { thinking: { type: "disabled" } },
    });
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-v4-pro", "low"),
    ).toEqual({
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "low" },
    });
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-v4-pro", "xhigh"),
    ).toEqual({
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "max" },
    });
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-v4-pro", "medium"),
    ).toBe(undefined);
  });
});

describe("OpenAI reasoning configs", () => {
  it("lists GPT-6 Astra as the newest OpenAI model", () => {
    expect(getModelsForProvider("openai")[0]).toMatchObject({
      id: "gpt-6-astra",
      displayName: "GPT-6 Astra",
    });
  });

  it("keeps GPT-6 Astra and GPT-6.1 Sol on always-on reasoning", () => {
    for (const modelId of ["gpt-6-astra", "gpt-6.1-sol"]) {
      expect(getDefaultReasoningEffort("openai", modelId)).toBe("medium");
      expect(getSupportedReasoningEfforts("openai", modelId)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    }
    expect(
      getReasoningProviderOptions("openai", "gpt-6-astra", "xhigh"),
    ).toEqual({
      openai: { reasoningEffort: "xhigh", reasoningSummary: "detailed" },
    });
    expect(getReasoningProviderOptions("openai", "gpt-6-astra", "none")).toBe(
      undefined,
    );
  });

  it("lets GPT-6 Sol, GPT-6 Luna and GPT-5.6 turn reasoning off", () => {
    for (const modelId of [
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]) {
      expect(getSupportedReasoningEfforts("openai", modelId)).toEqual([
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    }
  });

  it("derives configs for custom GPT-6 and GPT-5.6 ids", () => {
    expect(getSupportedReasoningEfforts("openai", "gpt-6.2-sol")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(
      getReasoningProviderOptions("openai", "gpt-6.2-sol", "high"),
    ).toEqual({
      openai: {
        forceReasoning: true,
        reasoningEffort: "high",
        reasoningSummary: "detailed",
      },
    });
    expect(
      getSupportedReasoningEfforts("openai", "gpt-6-sol-2026-09-22"),
    ).toEqual(["none", "low", "medium", "high", "xhigh"]);
    expect(
      getSupportedReasoningEfforts("openai", "gpt-6-astra-2026-09-03"),
    ).toEqual(["low", "medium", "high", "xhigh"]);
    expect(
      getSupportedReasoningEfforts("openai", "gpt-5.6-2026-07-09"),
    ).toEqual(["none", "low", "medium", "high", "xhigh"]);
    expect(getSupportedReasoningEfforts("openai", "gpt-4o-2024-11-20")).toEqual(
      [],
    );
  });

  it("keeps GPT-5.5 on the full OpenAI effort set with its medium default", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.5")).toBe("medium");
    expect(
      getSupportedReasoningEfforts("openai", "gpt-5.5-2026-04-23"),
    ).toEqual(["none", "low", "medium", "high", "xhigh"]);
    expect(getSupportedReasoningEfforts("openai", "gpt-5.5")).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("keeps frontier GPT-5.4 models on the full OpenAI effort set", () => {
    for (const modelId of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]) {
      expect(getDefaultReasoningEffort("openai", modelId)).toBe("none");
      expect(getSupportedReasoningEfforts("openai", modelId)).toEqual([
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    }
  });

  it("keeps GPT-5.2 on the full OpenAI effort set", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.2")).toBe("none");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.2")).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("limits GPT-5.2 Pro to medium and above", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.2-pro")).toBe("medium");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.2-pro")).toEqual([
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("uses none as the default for GPT-5.1 models", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.1")).toBe("none");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.1")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("keeps GPT-5 Pro fixed to high reasoning", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5-pro")).toBe("high");
    expect(getSupportedReasoningEfforts("openai", "gpt-5-pro")).toEqual([
      "high",
    ]);
  });

  it("preserves legacy GPT-5 minimal reasoning behavior", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5")).toBe("minimal");
    expect(getSupportedReasoningEfforts("openai", "gpt-5")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    // GPT-5 itself has no `none` level; `minimal` is sent as is.
    expect(getReasoningProviderOptions("openai", "gpt-5", "minimal")).toEqual({
      openai: { reasoningEffort: "minimal", reasoningSummary: "detailed" },
    });
  });

  it("keeps Codex models and o-series models off efforts they reject", () => {
    expect(getSupportedReasoningEfforts("openai", "gpt-5.3-codex")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(getDefaultReasoningEffort("openai", "gpt-5.3-codex")).toBe("medium");
    expect(getSupportedReasoningEfforts("openai", "o3")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(getReasoningProviderOptions("openai", "o3", "minimal")).toBe(
      undefined,
    );
    expect(getSupportedReasoningEfforts("openai", "gpt-5.4-pro")).toEqual([
      "medium",
      "high",
      "xhigh",
    ]);
  });
});

describe("Anthropic reasoning configs", () => {
  it("lists Claude Opus 5.5 first with its medium default effort", () => {
    expect(getModelsForProvider("anthropic")[0]?.id).toBe("claude-opus-5-5");
    expect(getDefaultReasoningEffort("anthropic", "claude-opus-5-5")).toBe(
      "medium",
    );
    expect(
      getSupportedReasoningEfforts("anthropic", "claude-opus-5-5"),
    ).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("sends effort with adaptive, summarized thinking on Claude 4.7+ models", () => {
    for (const modelId of [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
    ]) {
      expect(
        getReasoningProviderOptions("anthropic", modelId, "xhigh"),
      ).toEqual({
        anthropic: {
          effort: "xhigh",
          thinking: { type: "adaptive", display: "summarized" },
        },
      });
    }
    expect(getDefaultReasoningEffort("anthropic", "claude-sonnet-5-5")).toBe(
      "high",
    );
  });

  it("drops stale thinking blocks on preserved-thinking Claude models", () => {
    for (const modelId of [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
    ]) {
      expect(
        getReasoningProviderOptions("anthropic", modelId, "xhigh"),
      ).toEqual({
        anthropic: {
          effort: "xhigh",
          thinking: {
            type: "adaptive",
            display: "summarized",
            blockBinding: { prefixMismatchBehavior: "drop_block" },
          },
        },
      });
      // Without a usable effort the model keeps its default thinking mode
      // but still opts out of failing on edited history.
      for (const effort of [null, undefined, "none"] as const) {
        expect(
          getReasoningProviderOptions("anthropic", modelId, effort),
        ).toEqual({
          anthropic: {
            thinking: {
              blockBinding: { prefixMismatchBehavior: "drop_block" },
            },
          },
        });
      }
    }
    expect(
      getReasoningProviderOptions("anthropic", "claude-opus-4-8", null),
    ).toBeUndefined();
  });

  it("maps the top level to max on Claude Opus 4.6 and Sonnet 4.6", () => {
    expect(
      getReasoningProviderOptions("anthropic", "claude-opus-4-6", "xhigh"),
    ).toEqual({
      anthropic: {
        effort: "max",
        thinking: { type: "adaptive", display: "summarized" },
      },
    });
    expect(
      getReasoningProviderOptions("anthropic", "claude-sonnet-4-6", "low"),
    ).toEqual({
      anthropic: {
        effort: "low",
        thinking: { type: "adaptive", display: "summarized" },
      },
    });
  });

  it("keeps Claude Opus 4.5 on effort only, without adaptive thinking", () => {
    expect(
      getSupportedReasoningEfforts("anthropic", "claude-opus-4-5"),
    ).toEqual(["low", "medium", "high"]);
    expect(
      getReasoningProviderOptions("anthropic", "claude-opus-4-5", "medium"),
    ).toEqual({ anthropic: { effort: "medium" } });
  });

  it("offers no effort control on models that reject it", () => {
    expect(
      getSupportedReasoningEfforts("anthropic", "claude-haiku-4-5"),
    ).toEqual([]);
    expect(
      getSupportedReasoningEfforts("anthropic", "claude-sonnet-4-5"),
    ).toEqual([]);
  });
});

describe("Google reasoning configs", () => {
  it("uses thinking levels with thought summaries on Gemini 3.x", () => {
    expect(getModelsForProvider("google")[0]?.id).toBe("gemini-3.8-flash");
    expect(getSupportedReasoningEfforts("google", "gemini-3.8-flash")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(getDefaultReasoningEffort("google", "gemini-3.8-flash")).toBe(
      "medium",
    );
    expect(
      getReasoningProviderOptions("google_vertex", "gemini-3.8-flash", "low"),
    ).toEqual({
      google: {
        thinkingConfig: { thinkingLevel: "low", includeThoughts: true },
      },
    });
    expect(getSupportedReasoningEfforts("google", "gemini-3.6-flash")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(getDefaultReasoningEffort("google", "gemini-3.5-flash-lite")).toBe(
      "minimal",
    );
    expect(
      getSupportedReasoningEfforts("google", "gemini-3.1-pro-preview"),
    ).toEqual(["low", "medium", "high"]);
    expect(getDefaultReasoningEffort("google", "gemini-3-flash-preview")).toBe(
      "high",
    );
  });

  it("derives thinking levels for custom Gemini ids by version", () => {
    expect(
      getSupportedReasoningEfforts("google", "gemini-3.9-flash-preview"),
    ).toEqual(["low", "medium", "high"]);
    expect(getSupportedReasoningEfforts("google", "gemini-4-flash")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(
      getSupportedReasoningEfforts("google", "gemini-3.1-flash-lite-preview"),
    ).toEqual(["minimal", "low", "medium", "high"]);
    expect(
      getSupportedReasoningEfforts("google", "gemini-3-pro-preview"),
    ).toEqual(["low", "high"]);
    expect(
      getSupportedReasoningEfforts("google_vertex", "gemini-3.2-pro-preview"),
    ).toEqual(["low", "medium", "high"]);
    expect(
      getSupportedReasoningEfforts("google", "gemini-flash-latest"),
    ).toEqual([]);
  });

  it("keeps Gemini 2.5 on thinking budgets", () => {
    expect(
      getReasoningProviderOptions("google", "gemini-2.5-flash", "minimal"),
    ).toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
  });
});

describe("other provider reasoning configs", () => {
  it("sends xAI reasoning effort only to models that accept it", () => {
    expect(getReasoningProviderOptions("xai", "grok-4.7", "xhigh")).toEqual({
      xai: { reasoningEffort: "xhigh" },
    });
    expect(getDefaultReasoningEffort("xai", "grok-4.3")).toBe("low");
    expect(getSupportedReasoningEfforts("xai", "grok-4.3")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
    // xhigh exists on grok-4.6 and later; grok-4.5 treats it as high.
    expect(getSupportedReasoningEfforts("xai", "grok-4.6")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(getSupportedReasoningEfforts("xai", "grok-4.5")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    // grok-4.20 reasoning variants reject the parameter for every value.
    expect(getSupportedReasoningEfforts("xai", "grok-4.20-reasoning")).toEqual(
      [],
    );
  });

  it("maps Kimi K3's top effort to max and toggles K2.6 thinking", () => {
    // `max` is K3's API default.
    expect(getDefaultReasoningEffort("moonshotai", "kimi-k3")).toBe("xhigh");
    expect(
      getReasoningProviderOptions("moonshotai", "kimi-k3", "xhigh"),
    ).toEqual({ moonshotai: { reasoningEffort: "max" } });
    expect(
      getReasoningProviderOptions("moonshotai", "kimi-k2.6", "none"),
    ).toEqual({ moonshotai: { thinking: { type: "disabled" } } });
  });

  it("uses the provider's own reasoning options for Mistral, Groq and Cohere", () => {
    expect(
      getReasoningProviderOptions("mistral", "mistral-large-4", "none"),
    ).toEqual({ mistral: { reasoningEffort: "none" } });
    // mistral-large-latest is Large 3, which has no adjustable reasoning
    // (and @ai-sdk/mistral would not send it for that id).
    expect(
      getSupportedReasoningEfforts("mistral", "mistral-large-latest"),
    ).toEqual([]);
    expect(
      getReasoningProviderOptions("groq", "openai/gpt-oss-120b", "low"),
    ).toEqual({ groq: { reasoningEffort: "low" } });
    expect(
      getReasoningProviderOptions(
        "cohere",
        "command-a-reasoning-08-2025",
        "high",
      ),
    ).toEqual({ cohere: { thinking: { type: "enabled" } } });
  });
});

describe("helper reasoning effort", () => {
  it("picks the least reasoning each model accepts", () => {
    expect(getLowestReasoningEffort("openai", "gpt-6-luna")).toBe("none");
    expect(getLowestReasoningEffort("openai", "gpt-6-astra")).toBe("low");
    expect(getLowestReasoningEffort("openai", "gpt-5")).toBe("minimal");
    expect(getLowestReasoningEffort("google", "gemini-3.5-flash-lite")).toBe(
      "minimal",
    );
    expect(getLowestReasoningEffort("deepseek", "deepseek-flash")).toBe("none");
    expect(getLowestReasoningEffort("anthropic", "claude-haiku-4-5")).toBe(
      null,
    );
    expect(getLowestReasoningEffort("ollama", "llama3.2")).toBe(null);
  });
});

import { beforeEach, describe, expect, it, mock } from "bun:test";

let storedThread: {
  chatModelId: string | null;
  chatReasoningEffort: string | null;
} | null = null;

mock.module("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => storedThread,
        }),
      }),
    }),
  },
}));

const getEnabledModels = mock(async () => [
  {
    compositeId: "anthropic:claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    isCustom: false,
    modelId: "claude-sonnet-5-5",
    provider: "anthropic",
  },
  {
    compositeId: "deepseek:deepseek-flash",
    displayName: "DeepSeek Flash",
    isCustom: false,
    modelId: "deepseek-flash",
    provider: "deepseek",
  },
  {
    compositeId: "openai:gpt-5-codex",
    displayName: "gpt-5-codex",
    isCustom: true,
    modelId: "gpt-5-codex",
    provider: "openai",
  },
]);
const getLanguageModel = mock(async (_userId: string, compositeId: string) => ({
  compositeId,
}));

mock.module("../../providers/resolver", () => ({
  getEnabledModels,
  getLanguageModel,
  parseModelId: (compositeId: string) => {
    const separatorIndex = compositeId.indexOf(":");
    return {
      model: compositeId.slice(separatorIndex + 1),
      provider: compositeId.slice(0, separatorIndex),
    };
  },
}));

const { resolveThreadChatModel } = await import("./model");

function request(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "thread-1",
    userId: "user-1",
    ...overrides,
  } as Parameters<typeof resolveThreadChatModel>[0];
}

describe("resolveThreadChatModel", () => {
  beforeEach(() => {
    storedThread = null;
    getLanguageModel.mockClear();
  });

  it("moves a thread on a retired built-in model to its successor", async () => {
    storedThread = {
      chatModelId: "anthropic:claude-3-7-sonnet-20250219",
      chatReasoningEffort: "high",
    };

    const resolved = await resolveThreadChatModel(request());

    expect(resolved).toMatchObject({
      contextWindow: 1_000_000,
      providerId: "anthropic",
      requestedModelId: "anthropic:claude-sonnet-5-5",
      responseModelId: "claude-sonnet-5-5",
    });
    // The thread's stored effort still applies to the successor.
    expect(resolved.providerOptions).toEqual({
      anthropic: {
        effort: "high",
        thinking: { type: "adaptive", display: "summarized" },
      },
    });
    expect(getLanguageModel).toHaveBeenCalledWith(
      "user-1",
      "anthropic:claude-sonnet-5-5",
    );
  });

  it("upgrades a retired model id sent by an automation or client", async () => {
    const resolved = await resolveThreadChatModel(
      request({
        modelId: "deepseek:deepseek-reasoner",
        reasoningEffort: "none",
      }),
    );

    expect(resolved).toMatchObject({
      requestedModelId: "deepseek:deepseek-flash",
      responseModelId: "deepseek-flash",
      providerOptions: { deepseek: { thinking: { type: "disabled" } } },
    });
  });

  it("keeps a retired id that the user re-added as a custom model", async () => {
    const resolved = await resolveThreadChatModel(
      request({ modelId: "openai:gpt-5-codex" }),
    );

    expect(resolved.requestedModelId).toBe("openai:gpt-5-codex");
    expect(getLanguageModel).toHaveBeenCalledWith(
      "user-1",
      "openai:gpt-5-codex",
    );
  });

  it("passes unknown ids through unchanged", async () => {
    const resolved = await resolveThreadChatModel(
      request({ modelId: "ollama:my-local-model" }),
    );

    expect(resolved).toMatchObject({
      contextWindow: undefined,
      requestedModelId: "ollama:my-local-model",
    });
  });

  it("still requires a model id", async () => {
    await expect(resolveThreadChatModel(request())).rejects.toThrow(
      "Model id is required for this chat operation.",
    );
  });
});

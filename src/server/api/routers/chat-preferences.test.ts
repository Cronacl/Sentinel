// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";

const set = mock(() => ({
  where: mock(() => ({
    run: mock(() => undefined),
  })),
}));
const update = mock(() => ({ set }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    query: (handler: any) => handler,
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
  },
}));

mock.module("@/lib/ai/providers/resolver", () => ({
  getEnabledModels: mock(async () => [
    { compositeId: "openai:gpt-5.2", modelId: "gpt-5.2", provider: "openai" },
    {
      compositeId: "anthropic:claude-sonnet-4.5",
      modelId: "claude-sonnet-4.5",
      provider: "anthropic",
    },
  ]),
}));

const { chatPreferencesRouter } = await import("./chat-preferences");

describe("chatPreferencesRouter.updateGlobal", () => {
  it("updates mode without clearing the stored model selection", async () => {
    const result = await chatPreferencesRouter.updateGlobal({
      ctx: {
        db: { update },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatEngine: "sentinel",
          defaultChatMode: "chat",
          defaultChatModelId: "openai:gpt-5.2",
          defaultChatReasoningEffort: "medium",
        },
      },
      input: {
        mode: "plan",
      },
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      defaultChatMode: "plan",
    });
    expect(result).toEqual({
      engine: "sentinel",
      mode: "plan",
      modelId: "openai:gpt-5.2",
      reasoningEffort: "medium",
    });
  });

  it("persists codex engine selections with opaque model ids", async () => {
    const result = await chatPreferencesRouter.updateGlobal({
      ctx: {
        db: { update },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatEngine: "sentinel",
          defaultChatMode: "chat",
          defaultChatModelId: "openai:gpt-5.2",
          defaultChatReasoningEffort: "medium",
        },
      },
      input: {
        engine: "codex",
        modelId: "gpt-5-codex",
        reasoningEffort: "high",
      },
    });

    expect(set).toHaveBeenCalledWith({
      defaultChatEngine: "codex",
      defaultChatModelId: "gpt-5-codex",
      defaultChatReasoningEffort: "high",
    });
    expect(result).toEqual({
      engine: "codex",
      mode: "chat",
      modelId: "gpt-5-codex",
      reasoningEffort: "high",
    });
  });

  it("normalizes legacy stored model ids in get", async () => {
    const result = await chatPreferencesRouter.get({
      ctx: {
        user: {
          defaultChatEngine: "sentinel",
          defaultChatMode: "chat",
          defaultChatModelId: "gpt-5.2",
          defaultChatReasoningEffort: "medium",
          id: "user-1",
        },
      },
    });

    expect(result).toEqual({
      engine: "sentinel",
      mode: "chat",
      modelId: "openai:gpt-5.2",
      reasoningEffort: "medium",
    });
  });
});

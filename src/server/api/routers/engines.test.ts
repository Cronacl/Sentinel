// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const startReview = mock(async () => ({
  review: { id: "review-1", text: "ok" },
}));
const getOwnedThreadOrThrow = mock(async () => ({
  chatEngineState: {
    codex: {
      codexThreadId: "codex-thread-1",
    },
  },
}));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    mutation: (handler: any) => handler,
    query: (handler: any) => handler,
  },
}));

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => ({
    startReview,
  }),
}));

mock.module("@/lib/ai/chat/engines/types", () => ({
  getCodexThreadState: (value: any) => value?.codex ?? null,
}));

mock.module("@/lib/ai/providers/models", () => ({
  MODEL_CATALOG: {},
  getDefaultReasoningEffort: () => "medium",
  getModelsForProvider: () => [],
  getSupportedReasoningEfforts: () => [],
  isKnownModel: () => false,
}));

mock.module("@/lib/ai/providers/model-selection", () => ({
  getCompositeModelId: (provider: string, modelId: string) =>
    `${provider}:${modelId}`,
}));

mock.module("@/server/db/schema", () => ({
  modelPreferences: {
    userId: "modelPreferences.userId",
  },
  providerCredentials: {
    isEnabled: "providerCredentials.isEnabled",
    userId: "providerCredentials.userId",
  },
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedThreadOrThrow,
}));

const { enginesRouter } = await import("./engines");

beforeEach(() => {
  startReview.mockReset();
  getOwnedThreadOrThrow.mockReset();

  startReview.mockImplementation(async () => ({
    review: { id: "review-1", text: "ok" },
  }));
  getOwnedThreadOrThrow.mockImplementation(async () => ({
    chatEngineState: {
      codex: {
        codexThreadId: "codex-thread-1",
      },
    },
  }));
});

afterEach(() => {
  mock.restore();
});

describe("enginesRouter.codexReview", () => {
  it("verifies thread ownership before resolving the backing Codex thread", async () => {
    const ctx = {
      db: {},
      session: { user: { id: "user-1" } },
    };

    const result = await enginesRouter.codexReview({
      ctx,
      input: { threadId: "thread-1" },
    });

    expect(getOwnedThreadOrThrow).toHaveBeenCalledWith(ctx, "thread-1");
    expect(startReview).toHaveBeenCalledWith("codex-thread-1");
    expect(result).toEqual({
      review: { id: "review-1", text: "ok" },
    });
  });
});

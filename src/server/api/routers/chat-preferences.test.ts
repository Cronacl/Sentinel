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

const { chatPreferencesRouter } = await import("./chat-preferences");

describe("chatPreferencesRouter.updateGlobal", () => {
  it("updates mode without clearing the stored model selection", async () => {
    const result = await chatPreferencesRouter.updateGlobal({
      ctx: {
        db: { update },
        session: { user: { id: "user-1" } },
        user: {
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
      mode: "plan",
      modelId: "openai:gpt-5.2",
      reasoningEffort: "medium",
    });
  });
});

// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const providerFindMany = mock(async () => [
  { isEnabled: true, provider: "openai" },
  { isEnabled: false, provider: "groq" },
]);
const userFindFirst = mock(async () => ({
  voiceInputEnabled: true,
  voiceInputModelId: null,
  voiceInputProvider: "openai",
}));
const run = mock(() => undefined);
const where = mock(() => ({ run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/server/db/schema", () => ({
  providerCredentials: {
    provider: "provider_credentials.provider",
    userId: "provider_credentials.userId",
  },
  users: {
    id: "user.id",
  },
}));

const { voiceSettingsRouter } = await import("./voice-settings");

afterEach(() => {
  mock.restore();
});

describe("voiceSettingsRouter", () => {
  it("returns stored settings plus derived availability", async () => {
    const result = await voiceSettingsRouter.get({
      ctx: {
        db: {
          query: {
            providerCredentials: {
              findMany: providerFindMany,
            },
            users: {
              findFirst: userFindFirst,
            },
          },
        },
        session: {
          user: {
            id: "user-1",
          },
        },
        user: {
          voiceInputEnabled: true,
          voiceInputModelId: null,
          voiceInputProvider: "openai",
        },
      },
    });

    expect(result.voiceInputEnabled).toBe(true);
    expect(result.voiceInputProvider).toBe("openai");
    expect(result.isAvailable).toBe(true);
    expect(result.resolvedModelId).toBe("whisper-1");
  });

  it("updates the stored settings", async () => {
    const result = await voiceSettingsRouter.update({
      ctx: {
        db: {
          query: {
            providerCredentials: {
              findMany: providerFindMany,
            },
          },
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        voiceInputEnabled: true,
        voiceInputModelId: "whisper-large-v3-turbo",
        voiceInputProvider: "groq",
      },
    });

    expect(set).toHaveBeenCalledWith({
      voiceInputEnabled: true,
      voiceInputModelId: "whisper-large-v3-turbo",
      voiceInputProvider: "groq",
    });
    expect(run).toHaveBeenCalled();
    expect(result.voiceInputProvider).toBe("groq");
    expect(result.resolvedModelId).toBe("whisper-large-v3-turbo");
  });
});

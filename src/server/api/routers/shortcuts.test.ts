// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(async () => null);
const run = mock(() => undefined);
const where = mock(() => ({ run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/server/db/schema", () => ({
  users: {
    id: "user.id",
  },
}));

const { shortcutsRouter } = await import("./shortcuts");

beforeEach(() => {
  findFirst.mockReset();
  run.mockReset();
  run.mockImplementation(() => undefined);
  where.mockReset();
  where.mockImplementation(() => ({ run }));
  set.mockReset();
  set.mockImplementation(() => ({ where }));
  update.mockReset();
  update.mockImplementation(() => ({ set }));
});

afterEach(() => {
  mock.restore();
});

describe("shortcutsRouter.get", () => {
  it("returns merged effective bindings for the requested platform", async () => {
    findFirst.mockResolvedValueOnce({
      shortcutOverrides: {
        bindings: {
          "commandPalette.toggle": [],
          "settings.open": ["shift+mod+,"],
        },
        version: 1,
      },
    });

    const result = await shortcutsRouter.get({
      ctx: {
        db: {
          query: {
            users: {
              findFirst,
            },
          },
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        platform: "darwin",
      },
    });

    expect(result.effectiveBindings["commandPalette.toggle"]).toEqual([]);
    expect(result.effectiveBindings["settings.open"]).toEqual(["shift+mod+,"]);
    expect(result.effectiveBindings["thread.new"]).toEqual(["mod+n"]);
  });
});

describe("shortcutsRouter.update", () => {
  it("stores normalized overrides", async () => {
    findFirst.mockResolvedValueOnce({
      shortcutOverrides: null,
    });

    const result = await shortcutsRouter.update({
      ctx: {
        db: {
          query: {
            users: {
              findFirst,
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
        bindings: {
          "settings.open": [" Shift+Mod+, "],
        },
      },
    });

    expect(set).toHaveBeenCalledWith({
      shortcutOverrides: {
        bindings: {
          "settings.open": ["shift+mod+,"],
        },
        version: 1,
      },
    });
    expect(result).toEqual({
      bindings: {
        "settings.open": ["shift+mod+,"],
      },
      version: 1,
    });
  });

  it("rejects same-scope conflicts", async () => {
    findFirst.mockResolvedValueOnce({
      shortcutOverrides: null,
    });

    await expect(
      shortcutsRouter.update({
        ctx: {
          db: {
            query: {
              users: {
                findFirst,
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
          bindings: {
            "settings.open": ["mod+n"],
          },
        },
      }),
    ).rejects.toThrow("Shortcut conflict");
  });

  it("rejects unknown action ids", async () => {
    findFirst.mockResolvedValueOnce({
      shortcutOverrides: null,
    });

    await expect(
      shortcutsRouter.update({
        ctx: {
          db: {
            query: {
              users: {
                findFirst,
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
          bindings: {
            "settings.unknown": ["mod+n"],
          },
        },
      }),
    ).rejects.toThrow('Unknown shortcut action "settings.unknown"');
  });
});

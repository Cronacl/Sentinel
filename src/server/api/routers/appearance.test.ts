// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_SIZE,
} from "@/lib/appearance";

const findFirst = mock(
  async () =>
    ({
      codeFontFamily: '"JetBrains Mono", monospace',
      codeFontSize: 13.5,
      codeTheme: "dracula",
      themePreference: "dark",
      uiFontFamily: '"Avenir Next", sans-serif',
      uiFontSize: 17,
    }) as const,
);
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
  users: {
    id: "user.id",
  },
}));

const { appearanceRouter } = await import("./appearance");
const { appearanceFormSchema } = await import("@/schemas/appearance.schema");

afterEach(() => {
  mock.restore();
});

describe("appearanceRouter", () => {
  it("returns stored appearance settings", async () => {
    const result = await appearanceRouter.get({
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
    });

    expect(findFirst).toHaveBeenCalled();
    expect(result).toEqual({
      codeFontFamily: '"JetBrains Mono", monospace',
      codeFontSize: 13.5,
      codeTheme: "dracula",
      themePreference: "dark",
      uiFontFamily: '"Avenir Next", sans-serif',
      uiFontSize: 17,
    });
  });

  it("falls back to default appearance values when the user has none stored", async () => {
    findFirst.mockImplementationOnce(async () => ({
      codeFontFamily: null,
      codeFontSize: null,
      codeTheme: null,
      themePreference: null,
      uiFontFamily: null,
      uiFontSize: null,
    }));

    const result = await appearanceRouter.get({
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
    });

    expect(result).toEqual({
      codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
      codeFontSize: DEFAULT_CODE_FONT_SIZE,
      codeTheme: DEFAULT_CODE_THEME,
      themePreference: "system",
      uiFontFamily: DEFAULT_UI_FONT_FAMILY,
      uiFontSize: DEFAULT_UI_FONT_SIZE,
    });
  });

  it("updates the stored appearance settings", async () => {
    const input = {
      codeFontFamily: '"IBM Plex Mono", monospace',
      codeFontSize: 14,
      codeTheme: "github",
      themePreference: "light",
      uiFontFamily: '"Neue Haas Grotesk", sans-serif',
      uiFontSize: 15.5,
    } as const;

    const result = await appearanceRouter.update({
      ctx: {
        db: {
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input,
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(input);
    expect(run).toHaveBeenCalled();
    expect(result).toEqual(input);
  });
});

describe("appearanceFormSchema", () => {
  it("rejects empty font-family strings", () => {
    const parsed = appearanceFormSchema.safeParse({
      codeFontFamily: "   ",
      codeFontSize: 12.5,
      codeTheme: "default",
      themePreference: "system",
      uiFontFamily: "",
      uiFontSize: 16,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects out-of-range or non-half-step font sizes", () => {
    const parsed = appearanceFormSchema.safeParse({
      codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
      codeFontSize: 10.5,
      codeTheme: "default",
      themePreference: "system",
      uiFontFamily: DEFAULT_UI_FONT_FAMILY,
      uiFontSize: 15.25,
    });

    expect(parsed.success).toBe(false);
  });
});

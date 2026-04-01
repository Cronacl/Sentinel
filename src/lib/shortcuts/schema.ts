import { z } from "zod";

export const SHORTCUT_PLATFORMS = ["darwin", "linux", "win32"] as const;
export type ShortcutPlatform = (typeof SHORTCUT_PLATFORMS)[number];

export const SHORTCUT_SCOPE_KINDS = [
  "global",
  "thread",
  "overlay",
  "commandPalette",
] as const;
export type ShortcutScopeKind = (typeof SHORTCUT_SCOPE_KINDS)[number];

export const SHORTCUT_ACTION_IDS = [
  "commandPalette.toggle",
  "thread.new",
  "workspace.create",
  "automations.open",
  "skills.open",
  "settings.open",
  "sidebar.left.toggle",
  "browser.toggle",
  "terminal.toggle",
  "thread.pinToggle",
  "thread.rename",
  "thread.archive",
  "overlay.close",
] as const;

export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];
export type ShortcutChord = string;
export type ShortcutBindingsMap = Partial<
  Record<ShortcutActionId, ShortcutChord[]>
>;
export type ShortcutOverrides = {
  bindings: ShortcutBindingsMap;
  version: 1;
};

const SHORTCUT_MODIFIER_TOKENS = [
  "ctrl",
  "alt",
  "shift",
  "meta",
  "mod",
] as const;
type ShortcutModifierToken = (typeof SHORTCUT_MODIFIER_TOKENS)[number];

const MODIFIER_TOKEN_SET = new Set<string>(SHORTCUT_MODIFIER_TOKENS);
const NAMED_KEY_ALIASES: Record<string, string> = {
  esc: "escape",
};
const NAMED_KEYS = new Set(["escape"]);
const SHORTCUT_ACTION_ID_SET = new Set<string>(SHORTCUT_ACTION_IDS);

function normalizeShortcutKey(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Shortcut keys cannot be empty.");
  }

  const aliased = NAMED_KEY_ALIASES[trimmed] ?? trimmed;
  if (NAMED_KEYS.has(aliased)) {
    return aliased;
  }

  if (aliased.length === 1) {
    return aliased;
  }

  throw new Error(`Unsupported shortcut key "${value}".`);
}

function normalizeShortcutModifier(value: string): ShortcutModifierToken {
  const normalized = value.trim().toLowerCase();
  if (!MODIFIER_TOKEN_SET.has(normalized)) {
    throw new Error(`Unsupported shortcut modifier "${value}".`);
  }

  return normalized as ShortcutModifierToken;
}

export function normalizeShortcutChord(value: string): ShortcutChord {
  const tokens = value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Shortcut chords cannot be empty.");
  }

  const key = normalizeShortcutKey(tokens[tokens.length - 1] ?? "");
  const modifiers = new Set<ShortcutModifierToken>();

  for (const token of tokens.slice(0, -1)) {
    modifiers.add(normalizeShortcutModifier(token));
  }

  const orderedModifiers = SHORTCUT_MODIFIER_TOKENS.filter((token) =>
    modifiers.has(token),
  );

  return [...orderedModifiers, key].join("+");
}

export function normalizeShortcutBindingsMap(
  bindings: Record<string, string[]>,
): ShortcutBindingsMap {
  const normalizedEntries: [ShortcutActionId, ShortcutChord[]][] = [];

  for (const [actionId, chords] of Object.entries(bindings)) {
    if (!SHORTCUT_ACTION_ID_SET.has(actionId)) {
      throw new Error(`Unknown shortcut action "${actionId}".`);
    }

    const normalizedChords = [...new Set(chords.map(normalizeShortcutChord))];
    normalizedEntries.push([actionId as ShortcutActionId, normalizedChords]);
  }

  return Object.fromEntries(normalizedEntries) as ShortcutBindingsMap;
}

export function normalizeShortcutOverrides(
  value: ShortcutOverrides | null | undefined,
): ShortcutOverrides {
  if (!value) {
    return { bindings: {}, version: 1 };
  }

  return {
    bindings: normalizeShortcutBindingsMap(value.bindings ?? {}),
    version: 1,
  };
}

export const shortcutPlatformSchema = z.enum(SHORTCUT_PLATFORMS);

export const shortcutBindingsInputSchema = z
  .record(z.string(), z.array(z.string()))
  .superRefine((bindings, ctx) => {
    for (const [actionId, chords] of Object.entries(bindings)) {
      if (!SHORTCUT_ACTION_ID_SET.has(actionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown shortcut action "${actionId}".`,
          path: [actionId],
        });
        continue;
      }

      for (const [index, chord] of chords.entries()) {
        try {
          normalizeShortcutChord(chord);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              error instanceof Error
                ? error.message
                : "Invalid shortcut chord.",
            path: [actionId, index],
          });
        }
      }
    }
  })
  .transform((bindings) => normalizeShortcutBindingsMap(bindings));

export const shortcutOverridesSchema = z
  .object({
    bindings: shortcutBindingsInputSchema,
    version: z.literal(1),
  })
  .transform((value) => ({
    bindings: value.bindings,
    version: 1 as const,
  }));

export const shortcutOverridesUpdateSchema = z.object({
  bindings: shortcutBindingsInputSchema,
});

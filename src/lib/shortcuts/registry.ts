import {
  SHORTCUT_ACTION_IDS,
  type ShortcutActionId,
  type ShortcutBindingsMap,
  type ShortcutChord,
  type ShortcutOverrides,
  type ShortcutPlatform,
  type ShortcutScopeKind,
} from "./schema";

type ShortcutDefinition = {
  allowInEditable?: boolean;
  defaultBindings: Partial<
    Record<ShortcutPlatform | "default", ShortcutChord[]>
  >;
  description: string;
  id: ShortcutActionId;
  label: string;
  scope: ShortcutScopeKind;
};

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const;

type ParsedShortcutChord = {
  key: string;
  modifiers: Set<(typeof MODIFIER_ORDER)[number] | "mod">;
};

export const SHORTCUT_SCOPE_PRIORITY: Record<ShortcutScopeKind, number> = {
  commandPalette: 4,
  overlay: 3,
  thread: 2,
  global: 1,
};

export const SHORTCUT_DEFINITIONS: Record<
  ShortcutActionId,
  ShortcutDefinition
> = {
  "commandPalette.toggle": {
    allowInEditable: true,
    defaultBindings: { default: ["mod+k"] },
    description: "Open or close the command palette.",
    id: "commandPalette.toggle",
    label: "Toggle command palette",
    scope: "global",
  },
  "thread.new": {
    defaultBindings: { default: ["mod+n"] },
    description: "Start a new thread.",
    id: "thread.new",
    label: "New thread",
    scope: "global",
  },
  "workspace.create": {
    defaultBindings: { default: ["mod+o"] },
    description: "Create a workspace.",
    id: "workspace.create",
    label: "Create workspace",
    scope: "global",
  },
  "automations.open": {
    defaultBindings: { default: ["shift+mod+a"] },
    description: "Open automations.",
    id: "automations.open",
    label: "Open automations",
    scope: "global",
  },
  "scratchpad.open": {
    defaultBindings: { default: ["shift+mod+t"] },
    description: "Open Scratchpad.",
    id: "scratchpad.open",
    label: "Open Scratchpad",
    scope: "global",
  },
  "skills.open": {
    defaultBindings: { default: ["shift+mod+k"] },
    description: "Open skills.",
    id: "skills.open",
    label: "Open skills",
    scope: "global",
  },
  "settings.open": {
    allowInEditable: true,
    defaultBindings: { default: ["mod+,"] },
    description: "Open settings.",
    id: "settings.open",
    label: "Open settings",
    scope: "global",
  },
  "sidebar.left.toggle": {
    defaultBindings: { default: ["mod+b"] },
    description: "Toggle the left sidebar.",
    id: "sidebar.left.toggle",
    label: "Toggle sidebar",
    scope: "global",
  },
  "browser.toggle": {
    defaultBindings: { default: ["shift+mod+b"] },
    description: "Toggle the built-in browser.",
    id: "browser.toggle",
    label: "Toggle browser",
    scope: "global",
  },
  "terminal.toggle": {
    defaultBindings: { default: ["mod+j"] },
    description: "Toggle the embedded terminal.",
    id: "terminal.toggle",
    label: "Toggle terminal",
    scope: "global",
  },
  "thread.pinToggle": {
    defaultBindings: { default: ["alt+mod+p"] },
    description: "Pin or unpin the current thread.",
    id: "thread.pinToggle",
    label: "Pin thread",
    scope: "thread",
  },
  "thread.rename": {
    defaultBindings: { darwin: ["ctrl+meta+r"], default: ["alt+mod+r"] },
    description: "Rename the current thread.",
    id: "thread.rename",
    label: "Rename thread",
    scope: "thread",
  },
  "thread.archive": {
    defaultBindings: { default: ["shift+mod+a"] },
    description: "Archive the current thread.",
    id: "thread.archive",
    label: "Archive thread",
    scope: "thread",
  },
  "overlay.close": {
    allowInEditable: true,
    defaultBindings: { default: ["escape"] },
    description: "Close the active overlay.",
    id: "overlay.close",
    label: "Close overlay",
    scope: "overlay",
  },
};

export type ShortcutDefinitionRecord = typeof SHORTCUT_DEFINITIONS;

export function getShortcutDefinition(actionId: ShortcutActionId) {
  return SHORTCUT_DEFINITIONS[actionId];
}

function parseShortcutChord(chord: string): ParsedShortcutChord {
  const tokens = chord.split("+").map((token) => token.trim().toLowerCase());
  const key = tokens[tokens.length - 1] ?? "";
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number] | "mod">();

  for (const token of tokens.slice(0, -1)) {
    if (token === "mod") {
      modifiers.add("mod");
      continue;
    }

    if (MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number])) {
      modifiers.add(token as (typeof MODIFIER_ORDER)[number]);
    }
  }

  return {
    key,
    modifiers,
  };
}

function resolveChordModifiersForPlatform(
  modifiers: ParsedShortcutChord["modifiers"],
  platform: ShortcutPlatform,
) {
  const resolved = new Set<(typeof MODIFIER_ORDER)[number]>();

  for (const modifier of modifiers) {
    if (modifier === "mod") {
      resolved.add(platform === "darwin" ? "meta" : "ctrl");
      continue;
    }

    resolved.add(modifier);
  }

  return resolved;
}

function normalizeResolvedChord(
  chord: ShortcutChord,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutChord(chord);
  const resolvedModifiers = resolveChordModifiersForPlatform(
    parsed.modifiers,
    platform,
  );

  return [
    ...MODIFIER_ORDER.filter((token) => resolvedModifiers.has(token)),
    parsed.key,
  ]
    .filter(Boolean)
    .join("+");
}

function formatShortcutKeyLabel(key: string) {
  if (key === "escape") {
    return "Esc";
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

export function formatShortcutChordLabel(
  chord: ShortcutChord,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutChord(chord);
  const resolvedModifiers = resolveChordModifiersForPlatform(
    parsed.modifiers,
    platform,
  );

  if (platform === "darwin") {
    const labels: string[] = [];
    if (resolvedModifiers.has("ctrl")) labels.push("\u2303");
    if (resolvedModifiers.has("alt")) labels.push("\u2325");
    if (resolvedModifiers.has("shift")) labels.push("\u21e7");
    if (resolvedModifiers.has("meta")) labels.push("\u2318");
    labels.push(formatShortcutKeyLabel(parsed.key));
    return labels.join("");
  }

  const labels: string[] = [];
  if (resolvedModifiers.has("ctrl")) labels.push("Ctrl");
  if (resolvedModifiers.has("alt")) labels.push("Alt");
  if (resolvedModifiers.has("shift")) labels.push("Shift");
  if (resolvedModifiers.has("meta")) labels.push("Meta");
  labels.push(formatShortcutKeyLabel(parsed.key));
  return labels.join(" ");
}

export function getShortcutBindingsForAction(
  actionId: ShortcutActionId,
  platform: ShortcutPlatform,
) {
  const definition = getShortcutDefinition(actionId);
  return (
    definition.defaultBindings[platform] ??
    definition.defaultBindings.default ??
    []
  );
}

export function getDefaultShortcutBindings(platform: ShortcutPlatform) {
  const entries = SHORTCUT_ACTION_IDS.map((actionId) => [
    actionId,
    getShortcutBindingsForAction(actionId, platform),
  ]);

  return Object.fromEntries(entries) as Record<
    ShortcutActionId,
    ShortcutChord[]
  >;
}

export function mergeShortcutBindings(
  platform: ShortcutPlatform,
  overrides: ShortcutOverrides | null | undefined,
) {
  const defaults = getDefaultShortcutBindings(platform);
  const merged = { ...defaults } as Record<ShortcutActionId, ShortcutChord[]>;

  for (const actionId of SHORTCUT_ACTION_IDS) {
    if (overrides?.bindings[actionId]) {
      merged[actionId] = overrides.bindings[actionId] ?? [];
    }
  }

  return merged;
}

export function getShortcutLabel(
  actionId: ShortcutActionId,
  platform: ShortcutPlatform,
  bindings: ShortcutBindingsMap,
) {
  const shortcutChords = bindings[actionId] ?? [];
  const primaryChord = shortcutChords[0];
  return primaryChord ? formatShortcutChordLabel(primaryChord, platform) : null;
}

export function matchesShortcutEvent(
  chord: ShortcutChord,
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutChord(chord);
  const resolved = resolveChordModifiersForPlatform(parsed.modifiers, platform);
  const eventKey = event.key.toLowerCase();
  const normalizedEventKey = eventKey === "esc" ? "escape" : eventKey;

  if (normalizedEventKey !== parsed.key) {
    return false;
  }

  return (
    event.ctrlKey === resolved.has("ctrl") &&
    event.altKey === resolved.has("alt") &&
    event.shiftKey === resolved.has("shift") &&
    event.metaKey === resolved.has("meta")
  );
}

export type ShortcutConflict = {
  actionIds: ShortcutActionId[];
  chord: string;
  platform: ShortcutPlatform;
  scope: ShortcutScopeKind;
};

export function findShortcutConflicts(
  overrides: ShortcutOverrides | null | undefined,
) {
  const conflicts: ShortcutConflict[] = [];

  for (const platform of ["darwin", "linux", "win32"] as const) {
    const bindings = mergeShortcutBindings(platform, overrides);
    const scopedChordMap = new Map<string, Set<ShortcutActionId>>();

    for (const actionId of SHORTCUT_ACTION_IDS) {
      const definition = getShortcutDefinition(actionId);
      const chords = bindings[actionId] ?? [];

      for (const chord of chords) {
        const resolvedChord = normalizeResolvedChord(chord, platform);
        const mapKey = `${definition.scope}:${resolvedChord}`;
        const actionIds =
          scopedChordMap.get(mapKey) ?? new Set<ShortcutActionId>();
        actionIds.add(actionId);
        scopedChordMap.set(mapKey, actionIds);
      }
    }

    for (const [mapKey, actionIds] of scopedChordMap.entries()) {
      if (actionIds.size < 2) {
        continue;
      }

      const [scope, chord] = mapKey.split(":");
      conflicts.push({
        actionIds: [...actionIds],
        chord: chord ?? "",
        platform,
        scope: scope as ShortcutScopeKind,
      });
    }
  }

  return conflicts;
}

export function listShortcutMetadata() {
  return SHORTCUT_ACTION_IDS.map((actionId) => {
    const definition = getShortcutDefinition(actionId);
    return {
      allowInEditable: definition.allowInEditable ?? false,
      defaultBindings: definition.defaultBindings,
      description: definition.description,
      id: actionId,
      label: definition.label,
      scope: definition.scope,
    };
  });
}

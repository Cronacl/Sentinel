import {
  PERMISSION_MODES,
  type PermissionMode as StoredPermissionMode,
} from "@/server/db/enums";

/**
 * Every permission mode Sentinel stores (user default, workspace override,
 * thread override). Each engine honours a subset, declared in its catalog
 * capabilities; the UI only offers that subset.
 */
export const PERMISSION_MODE_VALUES = PERMISSION_MODES;

export type PermissionMode = StoredPermissionMode;

/** The modes Sentinel's built-in engine and tools understand. */
export const BUILTIN_PERMISSION_MODES = [
  "default",
  "full",
] as const satisfies readonly PermissionMode[];

export type BuiltinPermissionMode = (typeof BUILTIN_PERMISSION_MODES)[number];

export const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

export const PERMISSION_MODE_OPTIONS = [
  {
    description: "Tools are limited to the selected workspace directory.",
    label: "Default permissions",
    value: "default",
  },
  {
    description:
      "File edits are applied without asking; other actions still ask.",
    label: "Accept edits",
    value: "accept_edits",
  },
  {
    description: "The agent decides which actions need your approval.",
    label: "Auto",
    value: "auto",
  },
  {
    description: "Tools can access any path on this machine.",
    label: "Full permissions",
    value: "full",
  },
] as const satisfies readonly {
  description: string;
  label: string;
  value: PermissionMode;
}[];

/** Least to most permissive. */
const PERMISSION_MODE_RANK: Record<PermissionMode, number> = {
  accept_edits: 1,
  auto: 2,
  default: 0,
  full: 3,
};

export function getPermissionModeOptions(
  supportedModes: readonly PermissionMode[],
) {
  return PERMISSION_MODE_OPTIONS.filter((option) =>
    supportedModes.includes(option.value),
  );
}

export function getPermissionModeLabel(mode: PermissionMode) {
  return (
    PERMISSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    mode
  );
}

/**
 * Maps a stored mode onto what an engine supports without ever granting
 * more than was chosen: an unsupported mode falls back to the most
 * permissive supported mode that is not above it (accept_edits and auto
 * become default on an engine that only knows default and full).
 */
export function resolveSupportedPermissionMode<T extends PermissionMode>(
  mode: PermissionMode | null | undefined,
  supportedModes: readonly [T, ...T[]],
): T {
  const requested = mode ?? DEFAULT_PERMISSION_MODE;

  if ((supportedModes as readonly PermissionMode[]).includes(requested)) {
    return requested as T;
  }

  const rank = PERMISSION_MODE_RANK[requested] ?? 0;
  const candidates = supportedModes
    .filter((supported) => PERMISSION_MODE_RANK[supported] <= rank)
    .sort(
      (left, right) => PERMISSION_MODE_RANK[right] - PERMISSION_MODE_RANK[left],
    );

  return (
    candidates[0] ??
    [...supportedModes].sort(
      (left, right) => PERMISSION_MODE_RANK[left] - PERMISSION_MODE_RANK[right],
    )[0]!
  );
}

/** A stored mode as Sentinel's built-in engine and tools apply it. */
export function resolveBuiltinPermissionMode(
  mode: PermissionMode | null | undefined,
): BuiltinPermissionMode {
  return resolveSupportedPermissionMode(mode, BUILTIN_PERMISSION_MODES);
}

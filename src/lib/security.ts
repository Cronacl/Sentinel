export const PERMISSION_MODE_VALUES = ["default", "full"] as const;

export type PermissionMode = (typeof PERMISSION_MODE_VALUES)[number];

export const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

export const PERMISSION_MODE_OPTIONS = [
  {
    description: "Tools are limited to the selected workspace directory.",
    label: "Default permissions",
    value: "default",
  },
  {
    description: "Tools can access any path on this machine.",
    label: "Full permissions",
    value: "full",
  },
] as const;

// Client-safe static metadata for every driver kind this build knows about.
// Server drivers, client descriptors and the instance registry all key off
// this table; nothing here imports Node or an agent SDK.
import { z } from "zod";

import type { PermissionMode } from "@/server/db/enums";

import type { EngineCapabilities } from "./contract/capabilities";
import {
  BUILTIN_DRIVER_KINDS,
  defaultInstanceIdForDriver,
  type BuiltinDriverKind,
  type DriverKind,
} from "./contract/ids";
import { baseInstanceConfigSchema } from "./contract/instance";

export {
  BUILTIN_DRIVER_KINDS,
  type BuiltinDriverKind,
  type DriverKind,
} from "./contract/ids";

/** Permission modes every existing driver supports today. */
export const DEFAULT_DRIVER_PERMISSION_MODES = [
  "default",
  "full",
] as const satisfies readonly PermissionMode[];

export type EngineDriverSkillsMeta = {
  dispatch?: "inline" | "mention" | "slash";
  globalDir?: string;
  installTarget?: string;
  sourceKind: string;
  workspaceDir?: string;
};

export type EngineDriverMeta = {
  capabilities: EngineCapabilities;
  /** Driver-owned instance config (engine_instance.config). */
  config: z.ZodType<Record<string, unknown>>;
  /** False for "acp": registry agents are added as instances. */
  defaultInstance: boolean;
  description: string;
  docsUrl?: string;
  /** Env var that points the runtime at an instance's home directory. */
  homeEnvVar: string | null;
  kind: BuiltinDriverKind;
  label: string;
  /** Env vars read as a binary override for the default instance only. */
  legacyEnvPathKeys: readonly string[];
  /** Mirrors capabilities.supportsMultipleInstances. */
  multiInstance: boolean;
  runtime: "builtin" | "external";
  skills?: EngineDriverSkillsMeta;
  stability: "stable" | "beta" | "experimental";
  /**
   * "planned" kinds are known (their thread state and rows round-trip) but
   * not implemented in this build: hidden from the UI and never routable.
   */
  status: "available" | "planned";
  /** Tool-name prefix of the driver's dynamic tools (per driver, never per instance). */
  toolPrefix: `${string}_` | null;
  transport: "ai-sdk" | "acp" | "app-server" | "http" | "rpc" | "sdk";
};

const EXTERNAL_MESSAGE_ACTIONS = {
  edit: true,
  planAnswers: false,
  regenerate: false,
  retry: false,
} as const;

const EXTERNAL_CAPABILITIES: EngineCapabilities = {
  messageActions: EXTERNAL_MESSAGE_ACTIONS,
  permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
  planModeChangeRequiresNewSession: false,
  reportsContextWindow: false,
  reportsNativeSkills: false,
  reportsSlashCommands: false,
  reportsUsageLimits: false,
  supportsApprovals: true,
  supportsConversationRollback: false,
  supportsCustomModels: true,
  supportsFork: false,
  supportsImages: false,
  supportsMcpInjection: false,
  supportsMultipleInstances: true,
  supportsPlanMode: "prompt",
  supportsResume: "native",
  supportsSteer: false,
  supportsTextGeneration: false,
  supportsUnattendedTools: true,
  supportsUserInput: false,
};

const homeConfigSchema = baseInstanceConfigSchema;

const binaryConfigSchema = baseInstanceConfigSchema.omit({ homePath: true });

const antigravityConfigSchema = z.looseObject({
  authMethodId: z.string().trim().min(1).optional(),
  gcpLocation: z.string().trim().min(1).optional(),
  gcpProject: z.string().trim().min(1).optional(),
});

const acpConfigSchema = z.looseObject({
  agentId: z.string().trim().min(1).max(128),
  authMethodId: z.string().trim().min(1).optional(),
  commandArgs: z.array(z.string().max(4096)).max(64).optional(),
  commandPath: z.string().trim().min(1).max(4096).optional(),
  distribution: z.enum(["binary", "npx", "uvx", "custom"]).optional(),
});

const emptyConfigSchema = z.looseObject({});

// Capabilities below describe each runtime as it behaves today; drivers may
// narrow them per instance after a probe.
export const DRIVER_CATALOG = {
  sentinel: {
    capabilities: {
      messageActions: {
        edit: true,
        planAnswers: true,
        regenerate: true,
        retry: true,
      },
      permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
      planModeChangeRequiresNewSession: false,
      reportsContextWindow: true,
      reportsNativeSkills: false,
      reportsSlashCommands: false,
      reportsUsageLimits: false,
      supportsApprovals: true,
      supportsConversationRollback: true,
      supportsCustomModels: false,
      supportsFork: false,
      supportsImages: true,
      supportsMcpInjection: true,
      supportsMultipleInstances: false,
      supportsPlanMode: "native",
      supportsResume: "native",
      supportsSteer: true,
      supportsTextGeneration: true,
      // Unattended runs decline what would ask (runtime/unattended.ts).
      supportsUnattendedTools: true,
      supportsUserInput: true,
    },
    config: emptyConfigSchema,
    defaultInstance: true,
    description:
      "Sentinel-managed runtime with plans, memory, and workspace tools.",
    homeEnvVar: null,
    kind: "sentinel",
    label: "Sentinel",
    legacyEnvPathKeys: [],
    multiInstance: false,
    runtime: "builtin",
    skills: {
      globalDir: ".sentinel/skills",
      sourceKind: "sentinel",
      workspaceDir: ".sentinel/skills",
    },
    stability: "stable",
    status: "available",
    toolPrefix: null,
    transport: "ai-sdk",
  },
  codex: {
    capabilities: {
      ...EXTERNAL_CAPABILITIES,
      // Typed literally so the runtime's mapping is checked when this widens.
      permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
      reportsContextWindow: true,
      reportsNativeSkills: true,
      reportsSlashCommands: true,
      supportsConversationRollback: true,
      supportsImages: true,
      supportsPlanMode: "native",
      supportsTextGeneration: true,
      supportsUserInput: true,
    },
    config: homeConfigSchema,
    defaultInstance: true,
    description: "Use the Codex CLI already configured on this machine.",
    docsUrl: "https://developers.openai.com/codex/cli",
    homeEnvVar: "CODEX_HOME",
    kind: "codex",
    label: "Codex",
    legacyEnvPathKeys: ["SENTINEL_CODEX_PATH", "CODEX_PATH"],
    multiInstance: true,
    runtime: "external",
    skills: { sourceKind: "codex" },
    stability: "stable",
    status: "available",
    toolPrefix: "codex_",
    transport: "app-server",
  },
  claude: {
    capabilities: {
      ...EXTERNAL_CAPABILITIES,
      // Typed literally so the runtime's mapping is checked when this widens.
      permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
      planModeChangeRequiresNewSession: true,
      reportsContextWindow: true,
      supportsImages: true,
      supportsPlanMode: "native",
      supportsTextGeneration: true,
      supportsUserInput: true,
    },
    config: homeConfigSchema,
    defaultInstance: true,
    description: "Use the locally configured Claude Code SDK runtime.",
    docsUrl: "https://docs.claude.com/en/docs/claude-code/overview",
    homeEnvVar: "CLAUDE_CONFIG_DIR",
    kind: "claude",
    label: "Claude",
    legacyEnvPathKeys: ["SENTINEL_CLAUDE_PATH", "CLAUDE_PATH"],
    multiInstance: true,
    runtime: "external",
    skills: {
      globalDir: ".claude/skills",
      sourceKind: "claude",
      workspaceDir: ".claude/skills",
    },
    stability: "stable",
    status: "available",
    toolPrefix: "claude_",
    transport: "sdk",
  },
  copilot: {
    capabilities: {
      ...EXTERNAL_CAPABILITIES,
      // Typed literally so the runtime's mapping is checked when this widens.
      permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
      supportsTextGeneration: true,
      supportsUserInput: true,
    },
    config: homeConfigSchema,
    defaultInstance: true,
    description: "Use the locally configured GitHub Copilot SDK runtime.",
    docsUrl: "https://docs.github.com/en/copilot/how-tos/copilot-cli",
    homeEnvVar: "COPILOT_HOME",
    kind: "copilot",
    label: "Copilot",
    legacyEnvPathKeys: [
      "SENTINEL_COPILOT_PATH",
      "COPILOT_CLI_PATH",
      "COPILOT_PATH",
    ],
    multiInstance: true,
    runtime: "external",
    skills: {
      globalDir: ".copilot/skills",
      sourceKind: "copilot",
      workspaceDir: ".github/skills",
    },
    stability: "stable",
    status: "available",
    toolPrefix: "copilot_",
    transport: "sdk",
  },
  cursor: {
    capabilities: {
      ...EXTERNAL_CAPABILITIES,
      // The shared ACP engine maps each mode (runtime/external/permissions.ts).
      permissionModes: ["default", "accept_edits", "full"],
      reportsSlashCommands: true,
      supportsImages: true,
      supportsMcpInjection: true,
      // Cursor's own plan mode (session/set_mode), else the plan preamble.
      supportsPlanMode: "acp-mode",
      supportsUserInput: true,
    },
    config: binaryConfigSchema,
    defaultInstance: true,
    description: "Use the locally configured Cursor Agent runtime.",
    docsUrl: "https://docs.cursor.com/en/cli/overview",
    homeEnvVar: null,
    kind: "cursor",
    label: "Cursor",
    legacyEnvPathKeys: ["SENTINEL_CURSOR_PATH"],
    multiInstance: true,
    runtime: "external",
    skills: {
      globalDir: ".cursor/skills",
      sourceKind: "cursor",
      workspaceDir: ".cursor/skills",
    },
    stability: "stable",
    status: "available",
    toolPrefix: "cursor_",
    transport: "acp",
  },
  opencode: {
    capabilities: {
      ...EXTERNAL_CAPABILITIES,
      // Typed literally so the runtime's mapping is checked when this widens.
      permissionModes: DEFAULT_DRIVER_PERMISSION_MODES,
      supportsPlanMode: "agent-select",
      // A new OpenCode session is created every turn; history is replayed.
      supportsResume: "replay",
    },
    config: binaryConfigSchema,
    defaultInstance: true,
    description: "Use the locally configured OpenCode runtime.",
    docsUrl: "https://opencode.ai/docs",
    homeEnvVar: null,
    kind: "opencode",
    label: "OpenCode",
    legacyEnvPathKeys: ["SENTINEL_OPENCODE_PATH"],
    multiInstance: true,
    runtime: "external",
    skills: {
      globalDir: ".config/opencode/skills",
      sourceKind: "opencode",
      workspaceDir: ".opencode/skills",
    },
    stability: "stable",
    status: "available",
    toolPrefix: "opencode_",
    transport: "http",
  },
  grok: {
    capabilities: { ...EXTERNAL_CAPABILITIES, supportsPlanMode: "acp-mode" },
    config: homeConfigSchema,
    defaultInstance: true,
    description: "Use the locally installed Grok Build agent.",
    homeEnvVar: "GROK_HOME",
    kind: "grok",
    label: "Grok",
    legacyEnvPathKeys: [],
    multiInstance: true,
    runtime: "external",
    stability: "experimental",
    status: "planned",
    toolPrefix: "grok_",
    transport: "acp",
  },
  antigravity: {
    capabilities: { ...EXTERNAL_CAPABILITIES, supportsPlanMode: "acp-mode" },
    config: antigravityConfigSchema,
    defaultInstance: true,
    description: "Use Google Antigravity through its ACP agent.",
    homeEnvVar: "GEMINI_HOME",
    kind: "antigravity",
    label: "Antigravity",
    legacyEnvPathKeys: [],
    multiInstance: true,
    runtime: "external",
    stability: "experimental",
    status: "planned",
    toolPrefix: "antigravity_",
    transport: "acp",
  },
  pi: {
    capabilities: { ...EXTERNAL_CAPABILITIES, supportsImages: true },
    config: binaryConfigSchema,
    defaultInstance: true,
    description: "Use the locally installed Pi coding agent.",
    homeEnvVar: null,
    kind: "pi",
    label: "Pi",
    legacyEnvPathKeys: [],
    multiInstance: true,
    runtime: "external",
    stability: "experimental",
    status: "planned",
    toolPrefix: "pi_",
    transport: "rpc",
  },
  acp: {
    capabilities: { ...EXTERNAL_CAPABILITIES, supportsPlanMode: "acp-mode" },
    config: acpConfigSchema,
    defaultInstance: false,
    description: "Agents installed from the ACP Registry.",
    homeEnvVar: null,
    kind: "acp",
    label: "ACP agent",
    legacyEnvPathKeys: [],
    multiInstance: true,
    runtime: "external",
    stability: "experimental",
    status: "planned",
    toolPrefix: "acp_",
    transport: "acp",
  },
} as const satisfies Record<BuiltinDriverKind, EngineDriverMeta>;

export function getDriverMeta(kind: string): EngineDriverMeta | null {
  return Object.hasOwn(DRIVER_CATALOG, kind)
    ? DRIVER_CATALOG[kind as BuiltinDriverKind]
    : null;
}

/** Implemented kinds, in presentation order. */
export const AVAILABLE_DRIVER_KINDS = BUILTIN_DRIVER_KINDS.filter(
  (kind) => DRIVER_CATALOG[kind].status === "available",
);

export function isAvailableDriverKind(kind: string) {
  return getDriverMeta(kind)?.status === "available";
}

export function getDriverLabel(kind: DriverKind) {
  return getDriverMeta(kind)?.label ?? kind;
}

/**
 * Permission modes a driver accepts. Unknown kinds get the built-in pair so
 * the composer never offers something nothing can honour.
 */
export function getDriverPermissionModes(
  kind: DriverKind,
): readonly PermissionMode[] {
  return (
    getDriverMeta(kind)?.capabilities.permissionModes ??
    DEFAULT_DRIVER_PERMISSION_MODES
  );
}

const NO_MESSAGE_ACTIONS = {
  edit: false,
  planAnswers: false,
  regenerate: false,
  retry: false,
} as const;

/**
 * Which message actions (retry, regenerate, edit, plan answers) the UI
 * offers on a thread of this driver. Unknown kinds offer none.
 */
export function getDriverMessageActions(kind: DriverKind | null | undefined) {
  return (
    (kind ? getDriverMeta(kind)?.capabilities.messageActions : null) ??
    NO_MESSAGE_ACTIONS
  );
}

/** Driver kinds whose default instance is synthesized when no row exists. */
export function listDefaultInstanceDrivers() {
  return AVAILABLE_DRIVER_KINDS.filter(
    (kind) => DRIVER_CATALOG[kind].defaultInstance,
  );
}

export function isDefaultInstanceId(instanceId: string, driver: DriverKind) {
  return (
    getDriverMeta(driver)?.defaultInstance === true &&
    instanceId === defaultInstanceIdForDriver(driver)
  );
}

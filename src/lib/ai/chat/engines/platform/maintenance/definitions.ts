import path from "node:path";

import type { ManagedInstallProgress } from "@/lib/runtime/managed-install/install";

import type {
  EngineInstallSource,
  ResolvedEngineInstance,
} from "../../contract";
import { normalizeEngineVersion } from "../manifest/compatibility";

// What Sentinel knows about installing and updating each driver's CLI.
// Every command here is vetted (recon/agentsdk-research.md, t3code's
// Drivers/*Driver.ts maintenance resolvers, MIT) and only ever runs after
// the user confirmed it in Settings → Engines. Which updater applies to an
// installed binary is decided from where it lives (ownership.ts).

export type EngineInstallCommand = {
  args: string[];
  /** What the user confirms; the exact command, as typed in a terminal. */
  display: string;
  executable: string;
};

export type EngineInstallOption = {
  /** Shown under the option. */
  description?: string;
  id: string;
  label: string;
  /** Platforms the option exists on (default: all). */
  platforms?: readonly NodeJS.Platform[];
  /**
   * A version the option installs, checked against the manifest: an option
   * whose generation this Sentinel cannot drive yet (OpenCode 2.x) is
   * shown but not offered.
   */
  representativeVersion?: string;
  /** Programs that must be on the instance's PATH. */
  requires: readonly string[];
  /** Builds the command from the resolved programs (absolute paths). */
  command(tools: Record<string, string>): EngineInstallCommand;
};

export type EngineNativeUpdate = {
  /** The updater's arguments; null when it cannot run (needs a target). */
  args(input: { targetVersion: string | null }): readonly string[] | null;
  /**
   * Variables the updater needs, from where the binary lives (Codex: the
   * CODEX_HOME whose standalone tree holds it). Maintenance commands run
   * without the instance's own home and variables (env.ts).
   */
  env?: (commandPath: string) => Record<string, string> | null;
  /** Paths the CLI's own installer owns: its updater runs first there. */
  ownsPath?: (commandPath: string) => boolean;
};

/**
 * A runtime Sentinel downloads and installs itself (P13: the Antigravity ACP
 * server), with the managed-install utilities. Run by the maintenance
 * runner, which reports its progress as the snapshot's installState.
 */
export type EngineManagedInstall = {
  description?: string;
  label: string;
  run(input: {
    instance: ResolvedEngineInstance;
    onProgress(progress: ManagedInstallProgress): void;
    signal: AbortSignal;
  }): Promise<void>;
};

export type EngineMaintenanceDefinition = {
  /**
   * Runtimes Sentinel ships (Copilot's bundled runtime): updated with
   * Sentinel, never installed or updated on their own.
   */
  bundledSources?: readonly EngineInstallSource[];
  install: readonly EngineInstallOption[];
  managedInstall?: EngineManagedInstall;
  /** Shown when nothing can be installed from Sentinel. */
  installHint: string;
  /** The CLI's own updater (`claude update`, `grok update`, …). */
  nativeUpdate?: EngineNativeUpdate;
  /**
   * npm package whose `latest` is the newest release (null: none). Decided
   * from the installed version where a CLI changed packages.
   */
  packageName(installedVersion: string | null): string | null;
};

const POSIX: readonly NodeJS.Platform[] = ["darwin", "linux"];

export function normalizeCommandPath(commandPath: string) {
  return commandPath.replaceAll("\\", "/").toLowerCase();
}

const CODEX_STANDALONE_SEGMENT = "/packages/standalone/";

/**
 * The CODEX_HOME a standalone Codex install lives in: its installer lays
 * out `<CODEX_HOME>/packages/standalone/…`, and `codex update` replaces the
 * tree under CODEX_HOME, which is not always ~/.codex (t3code
 * CodexDriver.ts, MIT).
 */
export function codexHomeFromStandalonePath(commandPath: string) {
  const slashed = commandPath.replaceAll("\\", "/");
  const index = slashed.toLowerCase().indexOf(CODEX_STANDALONE_SEGMENT);
  return index > 0 ? path.normalize(slashed.slice(0, index)) : null;
}

function npmGlobalInstall(input: {
  description?: string;
  id?: string;
  label?: string;
  packageName: string;
  representativeVersion?: string;
  scripts?: "allow" | "ignore";
}): EngineInstallOption {
  // npm 12 blocks install scripts by default and still exits 0, which would
  // leave CLIs whose postinstall finishes the install broken (claude copies
  // its native binary in place); the package's own scripts are allowed.
  // Older npm warns about the unknown flag and continues. (t3code
  // providerMaintenance.ts.)
  const scriptFlag =
    input.scripts === "ignore"
      ? "--ignore-scripts"
      : `--allow-scripts=${input.packageName}`;
  return {
    ...(input.description ? { description: input.description } : {}),
    command: (tools) => ({
      args: ["install", "-g", scriptFlag, input.packageName],
      display: `npm install -g ${scriptFlag} ${input.packageName}`,
      executable: tools.npm!,
    }),
    id: input.id ?? "npm",
    label: input.label ?? "npm (global)",
    ...(input.representativeVersion
      ? { representativeVersion: input.representativeVersion }
      : {}),
    requires: ["npm"],
  };
}

function shellScriptInstall(input: {
  /** curl flags as the vendor documents them (default -fsSL). */
  curlFlags?: string;
  label?: string;
  pipeTo: "bash" | "sh";
  url: string;
}): EngineInstallOption {
  const script = `curl ${input.curlFlags ?? "-fsSL"} ${input.url} | ${input.pipeTo}`;
  return {
    command: (tools) => ({
      args: ["-c", script],
      display: script,
      executable: tools.sh!,
    }),
    id: "script",
    label: input.label ?? "Official install script",
    platforms: POSIX,
    requires: ["sh", "curl", input.pipeTo],
  };
}

function powershellScriptInstall(url: string): EngineInstallOption {
  const script = `irm ${url} | iex`;
  return {
    command: (tools) => ({
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      display: script,
      executable: tools.powershell!,
    }),
    id: "powershell",
    label: "Official install script",
    platforms: ["win32"],
    requires: ["powershell"],
  };
}

const updateArgs =
  (...args: string[]) =>
  () =>
    args;

export const ENGINE_MAINTENANCE_DEFINITIONS: Record<
  string,
  EngineMaintenanceDefinition
> = {
  claude: {
    install: [npmGlobalInstall({ packageName: "@anthropic-ai/claude-code" })],
    installHint:
      "Install Claude Code: npm install -g @anthropic-ai/claude-code",
    nativeUpdate: {
      args: updateArgs("update"),
      // Claude Code's own installer (~/.local/bin/claude,
      // ~/.local/share/claude/, the older ~/.claude/local/).
      ownsPath: (commandPath) => {
        const normalized = normalizeCommandPath(commandPath);
        return (
          normalized.endsWith("/.local/bin/claude") ||
          normalized.endsWith("/.local/bin/claude.exe") ||
          normalized.includes("/.local/share/claude/") ||
          normalized.includes("/.claude/local/")
        );
      },
    },
    packageName: () => "@anthropic-ai/claude-code",
  },
  codex: {
    install: [
      npmGlobalInstall({ packageName: "@openai/codex" }),
      shellScriptInstall({
        pipeTo: "sh",
        url: "https://chatgpt.com/codex/install.sh",
      }),
      powershellScriptInstall("https://chatgpt.com/codex/install.ps1"),
    ],
    installHint: "Install the Codex CLI: npm install -g @openai/codex",
    nativeUpdate: {
      args: updateArgs("update"),
      env: (commandPath) => {
        const home = codexHomeFromStandalonePath(commandPath);
        return home ? { CODEX_HOME: home } : null;
      },
      // The standalone installer's tree under CODEX_HOME.
      ownsPath: (commandPath) =>
        normalizeCommandPath(commandPath).includes(CODEX_STANDALONE_SEGMENT),
    },
    packageName: () => "@openai/codex",
  },
  copilot: {
    bundledSources: ["sdk-bundled"],
    // Copilot's runtime ships with Sentinel (@github/copilot-sdk-<platform>).
    install: [],
    installHint:
      "Copilot's runtime is bundled with Sentinel. To run your own Copilot CLI instead, install it (brew install copilot-cli, or npm install -g @github/copilot) and set it as the instance's binary path.",
    nativeUpdate: { args: updateArgs("update") },
    packageName: () => "@github/copilot",
  },
  cursor: {
    install: [
      shellScriptInstall({
        curlFlags: "-fsS",
        pipeTo: "bash",
        url: "https://cursor.com/install",
      }),
    ],
    installHint:
      "Install Cursor Agent: curl -fsS https://cursor.com/install | bash",
    nativeUpdate: {
      args: updateArgs("update"),
      ownsPath: (commandPath) => {
        const normalized = normalizeCommandPath(commandPath);
        return (
          normalized.includes("/.local/share/cursor-agent/") ||
          normalized.endsWith("/.local/bin/agent") ||
          normalized.endsWith("/.local/bin/cursor-agent")
        );
      },
    },
    // Cursor Agent is not published on npm.
    packageName: () => null,
  },
  opencode: {
    install: [
      npmGlobalInstall({
        description: "OpenCode 1.x, the generation Sentinel drives today.",
        label: "npm (global), OpenCode 1.x",
        packageName: "opencode-ai",
        representativeVersion: "1.14.19",
      }),
      npmGlobalInstall({
        description: "OpenCode 2.x, the new server generation.",
        id: "npm-v2",
        label: "npm (global), OpenCode 2.x",
        packageName: "@opencode/cli",
        representativeVersion: "2.0.18",
      }),
    ],
    installHint: "Install OpenCode 1.x: npm install -g opencode-ai",
    nativeUpdate: {
      // `opencode upgrade` alone may cross from 1.x to 2.x, which converts
      // the shared database in place: it only runs with the latest version
      // of the installed generation as its target.
      args: ({ targetVersion }) =>
        targetVersion ? ["upgrade", targetVersion] : null,
      ownsPath: (commandPath) => {
        const normalized = normalizeCommandPath(commandPath);
        return (
          normalized.endsWith("/.opencode/bin/opencode") ||
          normalized.endsWith("/.opencode/bin/opencode.exe")
        );
      },
    },
    // 1.x ships as opencode-ai, 2.x as @opencode/cli; an install is only
    // ever updated within its own generation.
    packageName: (version) => {
      const normalized = normalizeEngineVersion("opencode", version);
      return normalized && Number(normalized.split(".")[0]) >= 2
        ? "@opencode/cli"
        : "opencode-ai";
    },
  },
  grok: {
    install: [
      npmGlobalInstall({ packageName: "@xai-official/grok" }),
      shellScriptInstall({
        pipeTo: "bash",
        url: "https://x.ai/cli/install.sh",
      }),
    ],
    installHint: "Install Grok Build: npm install -g @xai-official/grok",
    // `grok update` finds the installer that owns the binary itself.
    nativeUpdate: { args: updateArgs("update"), ownsPath: () => true },
    packageName: () => "@xai-official/grok",
  },
  pi: {
    install: [
      npmGlobalInstall({
        packageName: "@earendil-works/pi-coding-agent",
        scripts: "ignore",
      }),
      shellScriptInstall({ pipeTo: "sh", url: "https://pi.dev/install.sh" }),
    ],
    installHint:
      "Install Pi: npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
    // Pi's updater also covers npm, pnpm, yarn and bun globals.
    nativeUpdate: { args: updateArgs("update", "--self") },
    packageName: () => "@earendil-works/pi-coding-agent",
  },
  antigravity: {
    // A managed download (P13): the driver installs it into <state
    // root>/tools/antigravity-acp/ with the managed-install utilities.
    install: [],
    installHint: "Antigravity is installed by Sentinel itself.",
    packageName: () => null,
  },
  acp: {
    // Registry agents install from the ACP Registry browser (P13).
    install: [],
    installHint: "Install agents from the ACP Registry.",
    packageName: () => null,
  },
};

/**
 * A driver's maintenance definition: its own (drivers added later carry
 * one), else the built-in table.
 */
export function getEngineMaintenanceDefinition(
  driver: string | { kind: string; maintenance?: EngineMaintenanceDefinition },
) {
  if (typeof driver !== "string" && driver.maintenance) {
    return driver.maintenance;
  }
  const kind = typeof driver === "string" ? driver : driver.kind;
  return Object.hasOwn(ENGINE_MAINTENANCE_DEFINITIONS, kind)
    ? ENGINE_MAINTENANCE_DEFINITIONS[kind]!
    : null;
}

import type {
  DriverKind,
  EngineInstallSource,
  ResolvedEngineInstance,
} from "@/lib/ai/chat/engines/contract";
import type { ExternalAssistantMirror } from "@/lib/ai/chat/runtime/external/mirror";
import type {
  ExternalQuestion,
  ExternalQuestionResponse,
} from "@/lib/ai/chat/runtime/external/user-input";
import type { PermissionMode } from "@/server/db/enums";

import type { AcpAgentProcess } from "./connection";
import type { AcpCatalogModel } from "./config-options";
import type { AcpAuthMethodInfo, JsonRecord } from "./schema";

// What differs between ACP agents (design acp-and-agents §2.16). The shared
// engine (connection, session, probe, runtime) does everything else; a new
// ACP agent is one descriptor plus a driver entry.

export type AcpResolvedBinary = {
  /** Environment to launch with (the instance env, with the PATH it was found on). */
  env: Record<string, string | undefined>;
  path: string;
  source: EngineInstallSource;
  version: string | null;
};

export type AcpBinaryResolution = {
  binary: AcpResolvedBinary | null;
  /** Why nothing launchable was found. */
  error: string | null;
};

/** What a vendor extension handler can do in the running turn. */
export type AcpExtContext = {
  /**
   * Asks the user; resolves the answers, or null when the user cancelled or
   * nobody can answer (unattended runs never wait).
   */
  askUser(input: {
    prompt?: string | null;
    questions: ExternalQuestion[];
    title?: string | null;
    toolCallId: string;
  }): Promise<ExternalQuestionResponse | null>;
  /** False for unattended runs (automations). */
  readonly interactive: boolean;
  log(event: string, data?: Record<string, unknown>): void;
  readonly mirror: ExternalAssistantMirror;
  /** Persist and stream the mirror (debounced). */
  update(): void;
};

export type AcpExtRequestHandler = (
  params: unknown,
  context: AcpExtContext,
) => Promise<unknown>;

export type AcpExtNotificationHandler = (
  params: unknown,
  context: AcpExtContext,
) => void | Promise<void>;

export interface AcpAgentDescriptor {
  /** Stable id ("cursor"). */
  readonly id: string;
  readonly driver: DriverKind;
  /** Shown on tool cards and in messages ("Cursor"). */
  readonly label: string;
  /** The process, in errors and the pid registry ("Cursor Agent"). */
  readonly processLabel: string;
  /** Tool-name prefix of the driver's parts ("cursor_"). */
  readonly toolPrefix: `${string}_`;

  /** Finds the agent's binary for an instance (configured path first). */
  resolveBinary(
    instance: ResolvedEngineInstance,
    options?: { forceRefresh?: boolean },
  ): Promise<AcpBinaryResolution>;
  /** Arguments that start the ACP server ("acp"), before the instance's launchArgs. */
  readonly launchArgs: readonly string[];
  /** Forget cached binary resolutions. */
  invalidate?(): void;

  /** `clientCapabilities._meta` (Cursor: parameterizedModelPicker). */
  readonly clientCapabilitiesMeta?: JsonRecord;
  /** `_meta` on initialize. */
  readonly initializeMeta?: JsonRecord;
  /** Serve fs/read_text_file and fs/write_text_file. */
  readonly clientFs?: boolean;
  /** Serve terminal/*. */
  readonly clientTerminals?: boolean;
  /** `_meta` on session/prompt. */
  promptMeta?(turn: { promptId: string }): JsonRecord | undefined;
  /** `_meta` on session/cancel. */
  readonly cancelMeta?: JsonRecord;
  /** Send images even when promptCapabilities.image is false. */
  readonly forceImagePrompts?: boolean;

  readonly auth: {
    /**
     * lazy: open the session and authenticate only when the agent says
     * auth is required; eager: authenticate first; none: never.
     */
    readonly strategy: "eager" | "lazy" | "none";
    /** The method to use among those advertised (null: none fits). */
    methodId(methods: readonly AcpAuthMethodInfo[]): string | null;
    /** How long an in-run `authenticate` may take (browser sign-in). */
    readonly timeoutMs?: number;
    /** How to sign in outside Sentinel, for error messages. */
    loginHint?(binaryPath: string | null): string;
  };
  readonly session: { readonly prefer: "load" | "resume" };
  /**
   * native: the agent's plan mode (session/set_mode or a mode config
   * option), else the plan preamble; preamble: always the preamble; hidden:
   * the composer hides plan mode.
   */
  readonly planMode: "hidden" | "native" | "preamble";
  readonly permissionModes: readonly PermissionMode[];

  /** Models offered before the agent listed any (Cursor: its Auto model). */
  readonly fallbackModels?: readonly AcpCatalogModel[];

  readonly probe: {
    /** Bound for one full probe (spawn, initialize, model list). */
    readonly timeoutMs: number;
    /**
     * Models without a session (Cursor: cursor/list_available_models).
     * Throws the agent's auth error when signed out. Null: unknown.
     */
    listModels?(
      process: AcpAgentProcess,
      options: { timeoutMs: number },
    ): Promise<AcpCatalogModel[] | null>;
  };

  /** Vendor requests the agent sends (method name verbatim). */
  readonly extRequests?: Readonly<Record<string, AcpExtRequestHandler>>;
  /** Vendor notifications the agent sends. */
  readonly extNotifications?: Readonly<
    Record<string, AcpExtNotificationHandler>
  >;

  /** How long Stop waits for the prompt to end after session/cancel (default 5 s). */
  readonly cancelGraceMs?: number;
  onStdoutNoise?(line: string): void;
  onStderrLine?(line: string): void;
}

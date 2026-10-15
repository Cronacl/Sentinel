import type {
  DriverKind,
  EngineInstallSource,
  ResolvedEngineInstance,
} from "@/lib/ai/chat/engines/contract";
import type {
  ExternalAssistantMirror,
  ExternalToolKind,
} from "@/lib/ai/chat/runtime/external/mirror";
import type {
  PermissionDisposition,
  PermissionDispositionInput,
} from "@/lib/ai/chat/runtime/external/permissions";
import type {
  ExternalQuestion,
  ExternalQuestionResponse,
} from "@/lib/ai/chat/runtime/external/user-input";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { PermissionMode } from "@/server/db/enums";
import type * as acp from "@agentclientprotocol/sdk";

import type { AcpAgentProcess } from "./connection";
import type { AcpCatalogModel, AcpConfigOptionInfo } from "./config-options";
import type { AcpLaunch } from "./launch";
import type {
  AcpAuthMethodInfo,
  AcpPermissionOptionInfo,
  AcpSessionUpdateEnvelope,
  JsonRecord,
} from "./schema";

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
  /** The running user turn's prompt id (what `promptMeta` was given). */
  readonly promptId: string;
  /** The run's session (null until session/new|load answered). */
  readonly sessionId: string | null;
  /** A session/load is replaying stored history (not this turn's work). */
  readonly replaying: boolean;
  /** The instance environment the agent runs with. */
  readonly env: Record<string, string | undefined>;
  /**
   * Ends the user turn now, as if session/prompt had answered with
   * `stopReason`, or had failed with `error` (xAI's completion
   * notifications race the response, so they carry the failure too).
   */
  completeTurn(input: { stopReason: string | null } | { error: unknown }): void;
} & AcpProcessHolds;

/**
 * Keeps the agent process from being reaped while work it runs on its own
 * (Grok's background tasks) is outstanding; each hold ends on release, on
 * the process exit, or after a hard cap.
 */
export type AcpProcessHolds = {
  holdProcess(holdId: string): void;
  releaseProcess(holdId: string): void;
};

/** What a notification that arrives between turns can do. */
export type AcpIdleContext = AcpProcessHolds & {
  log(event: string, data?: Record<string, unknown>): void;
};

export type AcpExtRequestHandler = (
  params: unknown,
  context: AcpExtContext,
) => Promise<unknown>;

/** Where a descriptor's process is launched for. */
export type AcpLaunchPurpose = "auth" | "probe" | "session";

/** Per-attachment byte limits for native prompt content (larger files go as links). */
export type AcpPromptAttachmentPolicy = {
  /** Send audio blocks (when the agent advertises audio prompts). */
  readonly audio?: boolean;
  /** Image MIME types sent as image blocks (default: every image/*). */
  readonly imageMimeTypes?: readonly string[];
  readonly maxAudioBytes?: number;
  readonly maxImageBytes?: number;
  readonly maxTextBytes?: number;
  /** All native (image, audio, embedded) attachments of one prompt. */
  readonly maxTotalBytes?: number;
  /** PDFs as resource_link blocks to the stored file. */
  readonly pdfAsLink?: boolean;
};

/** A status the descriptor reads without spawning its agent (probe.mode "static"). */
export type AcpStaticProbe = {
  auth: {
    method: string | null;
    status: "authenticated" | "unauthenticated" | "unknown";
  };
  /** The agent takes image prompts. */
  imagePrompts: boolean;
  message?: string;
  /** The session can be continued natively (load or resume). */
  resumable: boolean;
};

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
  /**
   * Arguments per permission mode, in place of `launchArgs` (Grok picks its
   * mode on the command line). A change of mode respawns the agent; the
   * probe launches with "default".
   */
  launchArgsFor?(input: { permissionMode: PermissionMode }): readonly string[];
  /** Forget cached binary resolutions. */
  invalidate?(): void;
  /**
   * Builds the process launch instead of buildAcpLaunch (Antigravity: a
   * curated environment and a private profile prepared first).
   */
  prepareLaunch?(input: {
    binary: AcpResolvedBinary;
    cwd: string;
    instance: ResolvedEngineInstance;
    purpose: AcpLaunchPurpose;
  }): Promise<AcpLaunch>;
  /**
   * Protocol versions accepted in the initialize answer besides the one
   * Sentinel speaks (Antigravity answers 2 with a v1-shaped body).
   */
  readonly acceptedProtocolVersions?: readonly number[];
  /** Rewrites every inbound frame before it is routed (null drops it). */
  normalizeInbound?(message: acp.AnyMessage): acp.AnyMessage | null;

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
  /** Limits and extra kinds for native attachments (default: no limits, no audio). */
  readonly promptAttachments?: AcpPromptAttachmentPolicy;

  readonly auth: {
    /**
     * lazy: open the session and authenticate only when the agent says
     * auth is required; eager: authenticate first; none: never.
     */
    readonly strategy: "eager" | "lazy" | "none";
    /**
     * The method to use among those advertised (null: none fits); `env` is
     * the instance environment the agent runs with.
     */
    methodId(
      methods: readonly AcpAuthMethodInfo[],
      context?: { env: Record<string, string | undefined> },
    ): string | null;
    /**
     * `authenticate` never opens a sign-in (a cached token, an API key from
     * the environment), so unattended runs may send it too.
     */
    readonly headless?: boolean;
    /** How long an in-run `authenticate` may take (browser sign-in). */
    readonly timeoutMs?: number;
    /** How to sign in outside Sentinel, for error messages. */
    loginHint?(binaryPath: string | null): string;
    /**
     * Runs `authenticate` itself (Antigravity: fails fast when the agent
     * starts a browser sign-in inside a chat run). Throws
     * AcpAuthRequiredError when the user has to sign in elsewhere.
     */
    authenticate?(
      process: AcpAgentProcess,
      method: AcpAuthMethodInfo,
      options: { signal?: AbortSignal; timeoutMs: number },
    ): Promise<void>;
  };
  readonly session: { readonly prefer: "load" | "resume" };
  /**
   * native: the agent's plan mode (session/set_mode or a mode config
   * option), else the plan preamble; preamble: always the preamble; hidden:
   * the composer hides plan mode.
   */
  readonly planMode: "hidden" | "native" | "preamble";
  readonly permissionModes: readonly PermissionMode[];
  /**
   * The agent's session mode for a permission mode, set with
   * session/set_mode before each prompt (Antigravity: full → yolo). Null
   * leaves the mode alone.
   */
  permissionModeId?(mode: PermissionMode): string | null;
  /**
   * Rewrites the turn's model selection before it is applied (aliases that
   * must never reach the agent, effort encoded in model ids).
   */
  resolveModelSelection?(
    selection: { effort: ReasoningEffort | null; modelId: string | null },
    session: { configOptions: readonly AcpConfigOptionInfo[] },
  ): { effort: ReasoningEffort | null; modelId: string | null };
  /**
   * Answers a session/request_permission itself (Antigravity's native
   * questions share the method); null leaves it to the approval flow.
   */
  handlePermissionRequest?(
    params: unknown,
    context: AcpExtContext,
  ): Promise<unknown> | null;
  /** The tool kind of a tool_call(_update) when the wire kind misleads (subagents). */
  toolKind?(update: JsonRecord): ExternalToolKind | null;
  /**
   * Settles one permission request instead of the shared policy
   * (runtime/external/permissions.ts); null leaves it to the policy.
   */
  permissionDisposition?(
    input: PermissionDispositionInput,
  ): PermissionDisposition | null;
  /** The options a permission request offers, narrowed (null: as sent). */
  permissionOptions?(
    options: readonly AcpPermissionOptionInfo[],
  ): AcpPermissionOptionInfo[];

  /** Models offered before the agent listed any (Cursor: its Auto model). */
  readonly fallbackModels?: readonly AcpCatalogModel[];

  readonly probe: {
    /** Bound for one full probe (spawn, initialize, model list). */
    readonly timeoutMs: number;
    /**
     * static: never spawn the agent; `readStatic` tells the status from
     * what is on disk (Antigravity unpacks ~1 GB per launch).
     */
    readonly mode?: "spawn" | "static";
    readStatic?(
      instance: ResolvedEngineInstance,
      binary: AcpResolvedBinary,
    ): Promise<AcpStaticProbe>;
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

  /**
   * Handles a session/update itself instead of the mirror (true: handled),
   * such as frames of a background turn the agent runs on its own.
   */
  interceptSessionUpdate?(
    envelope: AcpSessionUpdateEnvelope,
    context: AcpExtContext,
  ): boolean;
  /** The message a failed session/prompt ends the turn with (null: its own). */
  promptErrorMessage?(error: unknown): string | null;

  /**
   * Vendor notifications handled while no turn runs (handlers are detached
   * between turns), such as a background task finishing after the turn.
   */
  readonly idleNotifications?: Readonly<
    Record<string, (params: unknown, context: AcpIdleContext) => void>
  >;

  /** How long Stop waits for the prompt to end after session/cancel (default 5 s). */
  readonly cancelGraceMs?: number;
  /**
   * cancel: session/cancel, then kill only after `cancelGraceMs`; kill:
   * session/cancel, then end the process at once so the agent's background
   * work dies too (the next turn loads the session again).
   */
  readonly stopStrategy?: "cancel" | "kill";
  /** Non-JSON stdout lines, with the process that wrote them. */
  onStdoutNoise?(line: string, process: AcpAgentProcess): void;
  onStderrLine?(line: string, process: AcpAgentProcess): void;
}

import type {
  EngineAuthCredentialField,
  EngineAuthMethod,
  ResolvedEngineInstance,
} from "../../contract";

// What a driver implements to sign an instance in and out (driver-contract
// §2.5). Drivers only describe and run the login; the flow store
// (flow-store.ts) owns flow lifetime, consent, cancellation, the TTL, the
// one-time terminal tickets, storing credentials and the snapshot refresh
// that verifies the result.

/** What the client asking for a flow can do. */
export type EngineAuthClientCapabilities = {
  /** An embedded terminal (the desktop app); false in a browser. */
  terminal: boolean;
};

/**
 * A command the user runs to sign in. Always built by a driver from the
 * instance's resolved binary: never from client input.
 */
export type EngineAuthTerminalCommand = {
  args: string[];
  command: string;
  /**
   * What to show the user to copy (the CLI itself rather than, say, the
   * Node runtime that runs a script CLI). Defaults to command and args.
   */
  display?: { args: string[]; command: string };
  /**
   * Extra variables for this command (never secrets); the instance's own
   * non-secret variables and PATH are added by the flow store.
   */
  env?: Record<string, string>;
  /** The embedded terminal's title. */
  title: string;
  /** Windows: `args` are one pre-quoted command line (cmd.exe shims). */
  windowsVerbatimArguments?: boolean;
};

/**
 * A non-interactive command the server runs itself (sign-out commands),
 * with the instance's full environment. Windows shims are handled by the
 * spawn helper, so `command` is the binary as resolved.
 */
export type EngineAuthBackgroundCommand = {
  args: string[];
  command: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type EngineAuthFlowContext = {
  readonly client: EngineAuthClientCapabilities;
  readonly flowId: string;
  /** Aborted when the flow is cancelled, replaced or expires. */
  readonly signal: AbortSignal;
  /** Removes instance variables (only names the instance sets). */
  clearInstanceSecrets(names: readonly string[]): Promise<string[]>;
  /** Shows the values to enter; resolves with them (trimmed, non-empty). */
  requestCredentials(
    fields: readonly EngineAuthCredentialField[],
    options?: { description?: string },
  ): Promise<Record<string, string>>;
  /** Runs a command on the server with the instance's environment. */
  runBackgroundCommand(
    command: EngineAuthBackgroundCommand,
  ): Promise<{ exitCode: number | null }>;
  /**
   * Shows a terminal command (embedded on desktop, to copy in a browser);
   * resolves when it exits or the user says it finished (exitCode null).
   */
  runTerminalCommand(
    command: EngineAuthTerminalCommand,
  ): Promise<{ exitCode: number | null }>;
  /** Stores values as sensitive (encrypted) instance variables. */
  saveInstanceSecrets(values: Record<string, string>): Promise<void>;
  setMessage(message: string): void;
  /** Shows a sign-in page to open. */
  showBrowser(url: string): void;
  /** Shows a device code to enter on a sign-in page. */
  showDeviceCode(input: { url: string; userCode: string }): void;
};

export type EngineAuthResult = {
  /** Shown when the flow succeeds (overrides the generic message). */
  message?: string;
} | void;

export interface EngineAuthController {
  /**
   * Sign-in methods the instance offers now (an empty list when the
   * runtime is missing and no credentials method applies).
   */
  methods(
    instance: ResolvedEngineInstance,
    client: EngineAuthClientCapabilities,
  ): Promise<EngineAuthMethod[]>;
  /**
   * Runs one sign-in method. Resolves when it finished (the store then
   * verifies with a fresh snapshot); throws EngineAuthError with text that
   * is safe to show, never credentials.
   */
  login(
    instance: ResolvedEngineInstance,
    methodId: string,
    context: EngineAuthFlowContext,
  ): Promise<EngineAuthResult>;
  logout?(
    instance: ResolvedEngineInstance,
    context: EngineAuthFlowContext,
  ): Promise<EngineAuthResult>;
  /**
   * What signing out affects beyond this instance (a login it shares with
   * the CLI on this computer, a runtime restart), for the confirmation.
   * Null when it affects only the instance.
   */
  logoutNotice?(instance: ResolvedEngineInstance): string | null;
}

/**
 * A sign-in failure whose message is safe to show the user: it never
 * contains tokens, codes or credentials.
 */
export class EngineAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineAuthError";
  }
}

export type EngineAuthFlowErrorCode =
  "conflict" | "invalid" | "not-found" | "unsupported";

/** A rejected flow request (unknown flow, wrong interaction, bad input). */
export class EngineAuthFlowError extends Error {
  constructor(
    readonly code: EngineAuthFlowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineAuthFlowError";
  }
}

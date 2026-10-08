import {
  isEngineAuthFlowActive,
  type EngineAuthCredentialField,
  type EngineAuthFlowState,
  type EngineAuthMethod,
  type EngineAuthSummary,
  type EngineAuthTerminalInteraction,
} from "@/lib/ai/chat/engines/contract";
import type { DesktopTerminalCommandInput } from "@/lib/desktop/contracts";

// What the auth panel in Settings → Engines shows, from the flow state and
// the methods an instance offers. Pure, so it is tested without React.

/**
 * The embedded terminal's request for a terminal-command interaction, or
 * null when it has no launch ticket (a browser, or a server that did not
 * mint one): the command is then shown to copy.
 */
export function toDesktopTerminalCommand(
  interaction: EngineAuthTerminalInteraction,
  size?: { cols: number; rows: number },
): DesktopTerminalCommandInput | null {
  if (!interaction.launch || !interaction.cwd) {
    return null;
  }

  return {
    args: interaction.args,
    command: interaction.command,
    cwd: interaction.cwd,
    env: interaction.env,
    ticket: interaction.launch.ticket,
    ...(interaction.title ? { title: interaction.title } : {}),
    ...(interaction.windowsVerbatimArguments
      ? { windowsVerbatimArguments: true }
      : {}),
    ...(size ? { cols: size.cols, rows: size.rows } : {}),
  };
}

/** What to copy into a terminal when none can be embedded. */
export function getTerminalDisplayCommand(
  interaction: EngineAuthTerminalInteraction,
) {
  return (
    interaction.displayCommand ??
    [interaction.command, ...interaction.args].join(" ")
  );
}

export type EngineAuthPanelView = {
  /** A flow runs: show it instead of the actions. */
  active: boolean;
  /** The last flow's outcome, until the server forgets it. */
  outcome: { message: string; tone: "danger" | "default" | "success" } | null;
  showSignOut: boolean;
  signInMethods: EngineAuthMethod[];
};

export function getEngineAuthPanelView(input: {
  auth: Pick<EngineAuthSummary, "status">;
  canLogout: boolean;
  /** The runtime was found (nothing to sign out of otherwise). */
  installed: boolean;
  methods: readonly EngineAuthMethod[];
  state: EngineAuthFlowState | null | undefined;
}): EngineAuthPanelView {
  const active = isEngineAuthFlowActive(input.state);
  const phase = input.state?.phase;
  const outcome =
    !active && input.state?.message && phase && phase !== "idle"
      ? {
          message: input.state.message,
          tone:
            phase === "succeeded"
              ? ("success" as const)
              : phase === "failed"
                ? ("danger" as const)
                : ("default" as const),
        }
      : null;

  return {
    active,
    outcome,
    showSignOut:
      !active &&
      input.canLogout &&
      input.installed &&
      input.auth.status !== "unauthenticated",
    signInMethods: active ? [] : [...input.methods],
  };
}

/** One empty value per field, for a fresh credentials form. */
export function emptyCredentialValues(
  fields: readonly EngineAuthCredentialField[],
) {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

/** The first field still empty, or null when the form can be sent. */
export function findMissingCredential(
  fields: readonly EngineAuthCredentialField[],
  values: Record<string, string>,
) {
  return fields.find((field) => !values[field.name]?.trim()) ?? null;
}

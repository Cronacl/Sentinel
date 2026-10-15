import type { EngineAuthFlowPurpose, EngineAuthSummary } from "../../contract";

// How a finished sign-in or sign-out reads once the instance has been probed
// again. The fresh snapshot is the verdict where it has one; a terminal
// command's exit code explains a failure. Engines that cannot tell whether
// they are signed in ("unknown") are taken at the driver's word.

export type EngineAuthFlowOutcome = {
  message: string;
  phase: "failed" | "succeeded";
};

export function resolveEngineAuthFlowOutcome(input: {
  /** After the refresh; null when the instance could not be probed. */
  auth: Pick<EngineAuthSummary, "status"> | null;
  /** What the driver reported on success (replaces the generic text). */
  driverMessage?: string | null;
  /** Terminal flows: the command's exit code (null: run elsewhere). */
  exitCode?: number | null;
  label: string;
  purpose: EngineAuthFlowPurpose;
}): EngineAuthFlowOutcome {
  const status = input.auth?.status ?? "unknown";
  const failedExit =
    typeof input.exitCode === "number" && input.exitCode !== 0
      ? input.exitCode
      : null;

  if (input.purpose === "login") {
    if (status === "authenticated") {
      return {
        message: input.driverMessage || `Signed in to ${input.label}.`,
        phase: "succeeded",
      };
    }
    if (failedExit !== null) {
      return {
        message: `The sign-in command exited with code ${failedExit}.`,
        phase: "failed",
      };
    }
    if (status === "unauthenticated") {
      return {
        message: `${input.label} still reports that it is not signed in.`,
        phase: "failed",
      };
    }
    return {
      message:
        input.driverMessage ||
        `Sign-in finished. ${input.label} does not report its account, so check that it works.`,
      phase: "succeeded",
    };
  }

  if (failedExit !== null) {
    return {
      message: `The sign-out command exited with code ${failedExit}.`,
      phase: "failed",
    };
  }
  if (input.driverMessage) {
    return { message: input.driverMessage, phase: "succeeded" };
  }
  if (status === "authenticated") {
    return {
      message: `Signed out, but ${input.label} still finds credentials (for example an API key in its environment).`,
      phase: "succeeded",
    };
  }
  return { message: `Signed out of ${input.label}.`, phase: "succeeded" };
}

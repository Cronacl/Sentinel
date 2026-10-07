import type {
  DriverKind,
  EngineInstanceId,
  EngineInstanceUnavailableReason,
} from "../contract";

/** References that keep an instance from being removed or disabled. */
export type EngineInstanceReferences = {
  automations: number;
  threads: number;
  userDefault: boolean;
};

export function countEngineInstanceReferences(
  references: EngineInstanceReferences,
) {
  return (
    references.threads +
    references.automations +
    (references.userDefault ? 1 : 0)
  );
}

/**
 * A thread, automation or request targets an instance that cannot run.
 * Dispatchers answer it with 409 {code: "engine_unavailable"}.
 */
export class EngineInstanceUnavailableError extends Error {
  readonly code = "engine_unavailable";

  constructor(
    readonly instanceId: EngineInstanceId,
    readonly driver: DriverKind,
    readonly reason: EngineInstanceUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "EngineInstanceUnavailableError";
  }
}

export type EngineInstanceErrorCode =
  "conflict" | "in-use" | "invalid" | "not-found" | "unsupported";

/** A rejected instance mutation (create, update, remove, enable/disable). */
export class EngineInstanceError extends Error {
  constructor(
    readonly code: EngineInstanceErrorCode,
    message: string,
    readonly details: {
      issues?: string[];
      references?: EngineInstanceReferences;
    } = {},
  ) {
    super(message);
    this.name = "EngineInstanceError";
  }
}

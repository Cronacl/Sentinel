import { z } from "zod";

// Driver kinds and instance ids share one slug format. Default instances use
// the driver kind as their id (t3code's defaultInstanceIdForDriver), so a
// NULL chat_engine_instance_id resolves to `thread.chat_engine` unchanged.
export const ENGINE_SLUG = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * Every driver kind this build knows about, including kinds that are
 * declared but not implemented yet (catalog status "planned"). Order is the
 * presentation order.
 */
export const BUILTIN_DRIVER_KINDS = [
  "sentinel",
  "codex",
  "claude",
  "copilot",
  "cursor",
  "opencode",
  "grok",
  "antigravity",
  "pi",
  "acp",
] as const;

export type BuiltinDriverKind = (typeof BUILTIN_DRIVER_KINDS)[number];

/**
 * Open on purpose: rows written by a newer build, a fork or an unmerged
 * branch (for example `gemini`) must parse and round-trip. Consumers look
 * the kind up in the catalog and treat unknown kinds as unavailable.
 */
export type DriverKind = BuiltinDriverKind | (string & {});
export type EngineInstanceId = string;

export type EngineTarget = {
  driver: DriverKind;
  instanceId: EngineInstanceId;
};

export const driverKindSchema = z.string().regex(ENGINE_SLUG);
export const engineInstanceIdSchema = z.string().regex(ENGINE_SLUG);

export const engineTargetSchema = z.object({
  driver: driverKindSchema,
  instanceId: engineInstanceIdSchema,
});

export function isBuiltinDriverKind(value: string): value is BuiltinDriverKind {
  return (BUILTIN_DRIVER_KINDS as readonly string[]).includes(value);
}

export function isEngineSlug(value: unknown): value is string {
  return typeof value === "string" && ENGINE_SLUG.test(value);
}

export function defaultInstanceIdForDriver(
  driver: DriverKind,
): EngineInstanceId {
  return driver;
}

/**
 * The value stored in chat_engine_instance_id columns: NULL for the
 * driver's default instance, so rows keep following the default.
 */
export function toStoredEngineInstanceId(
  driver: DriverKind,
  instanceId: EngineInstanceId | null | undefined,
): EngineInstanceId | null {
  return instanceId == null || instanceId === defaultInstanceIdForDriver(driver)
    ? null
    : instanceId;
}

/** The instance a stored (driver, instance id) pair points at. */
export function fromStoredEngineInstanceId(
  driver: DriverKind,
  instanceId: EngineInstanceId | null | undefined,
): EngineTarget {
  return {
    driver,
    instanceId: instanceId ?? defaultInstanceIdForDriver(driver),
  };
}

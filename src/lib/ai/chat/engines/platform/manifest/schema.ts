import semver from "semver";
import { z } from "zod";

import {
  driverKindSchema,
  ENGINE_MODEL_ID_PATTERN,
  engineModelInputModalitySchema,
  engineOptionDescriptorSchema,
  type EngineOptionDescriptor,
} from "../../contract";

// The engine manifest (manifests/engine-manifest.v1.json at the repository
// root, the path stays stable for every release): per-driver compatibility
// ranges and model catalogs with capability descriptors. A copy is bundled
// with every build; the manifest service refreshes it from the same file on
// main. Shape after design/driver-contract.md §5; the compatibility policy
// format follows t3code's model-manifest.json (MIT).
//
// The data reaches CLI argv (model ids) and the UI, so it is validated
// strictly where that matters and leniently where a newer file may add
// things: unknown keys are dropped, option descriptors of a type this build
// does not know are skipped, and a newer schemaVersion is rejected as a
// whole (the caller falls back to the bundle).

export const ENGINE_MANIFEST_SCHEMA_VERSION = 1;

export const ENGINE_COMPATIBILITY_STATUSES = [
  "supported",
  "graceful",
  "unsupported",
  "broken",
  "unknown",
] as const;

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Version numbers without leading zeros (Cursor's 2026.08.04 → 2026.8.4). */
export function stripVersionLeadingZeros(value: string) {
  return value.replace(/\d+/g, (digits) => String(Number(digits)));
}

/** A semver range as the manifest writes it, leading zeros allowed. */
export function normalizeVersionRange(range: string) {
  const normalized = stripVersionLeadingZeros(range.trim());
  return semver.validRange(normalized) ? normalized : null;
}

const versionRangeSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => normalizeVersionRange(value) !== null, {
    message: "Expected a semver range.",
  });

const stableVersionSchema = z.string().trim().regex(STABLE_VERSION_PATTERN);
const messageSchema = z.string().trim().min(1).max(500);
const modelIdSchema = z.string().regex(ENGINE_MODEL_ID_PATTERN);
const profileIdSchema = z.string().regex(PROFILE_ID_PATTERN);

export const engineCompatibilityStatusSchema = z.enum(
  ENGINE_COMPATIBILITY_STATUSES,
);

export const engineCompatibilityPolicySchema = z
  .object({
    driver: driverKindSchema,
    /** Sentinel versions (package.json) the policy applies to. */
    sentinelRange: versionRangeSchema,
    recommendedRange: versionRangeSchema.optional(),
    /** Must fall in a supported range. */
    recommendedVersion: stableVersionSchema.optional(),
    /** First match wins; no match is "unknown". */
    ranges: z
      .array(
        z.object({
          /**
           * Shown instead of the default advisory; `{label}`, `{version}`
           * and `{recommended}` are filled in.
           */
          message: messageSchema.optional(),
          range: versionRangeSchema,
          status: engineCompatibilityStatusSchema,
        }),
      )
      .max(32),
  })
  .refine(
    (policy) => {
      const version = policy.recommendedVersion;
      if (!version) {
        return true;
      }
      const satisfies = (range: string) =>
        semver.satisfies(version, normalizeVersionRange(range)!);
      return (
        (!policy.recommendedRange || satisfies(policy.recommendedRange)) &&
        policy.ranges.find((entry) => satisfies(entry.range))?.status ===
          "supported"
      );
    },
    { message: "recommendedVersion must fall in a supported range." },
  );

/** Option descriptors this build understands; others are skipped. */
const lenientOptionsSchema = z
  .array(z.unknown())
  .max(16)
  .transform((values) =>
    values.flatMap((value): EngineOptionDescriptor[] => {
      const parsed = engineOptionDescriptorSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  );

export const engineManifestProfileSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  inputModalities: z.array(engineModelInputModalitySchema).max(4).optional(),
  options: lenientOptionsSchema.default([]),
});

export const engineManifestModelSchema = z.object({
  aliases: z.array(modelIdSchema).max(16).optional(),
  badge: z.literal("new").optional(),
  contextWindow: z.number().int().positive().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  id: modelIdSchema,
  inputModalities: z.array(engineModelInputModalitySchema).max(4).optional(),
  /** Oldest runtime that offers the model (catalog models only). */
  minRuntimeVersion: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200),
  profile: profileIdSchema.optional(),
  /** Sent on the wire when it differs from `id`. */
  runtimeId: modelIdSchema.optional(),
  shortName: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["current", "legacy"]),
  subProvider: z.string().trim().min(1).max(128).optional(),
});

export const engineManifestDriverSchema = z
  .object({
    defaults: z
      .object({
        /** The model new threads start on when the runtime names none. */
        chat: modelIdSchema.optional(),
        /** Descriptors for a custom model the manifest does not know. */
        customModelProfile: profileIdSchema.optional(),
      })
      .optional(),
    /**
     * overlay: live discovery wins and the manifest classifies it, fills
     * missing descriptors and stands in while the runtime reports nothing.
     * catalog: the manifest is the model list.
     */
    mode: z.enum(["overlay", "catalog"]),
    models: z.array(engineManifestModelSchema).max(200).default([]),
    profiles: z
      .record(profileIdSchema, engineManifestProfileSchema)
      .default({}),
  })
  .superRefine((driver, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of driver.models.entries()) {
      for (const id of [entry.id, ...(entry.aliases ?? [])]) {
        if (ids.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate model id or alias "${id}".`,
            path: ["models", index],
          });
        }
        ids.add(id);
      }
      if (entry.profile && !driver.profiles[entry.profile]) {
        context.addIssue({
          code: "custom",
          message: `Unknown profile "${entry.profile}".`,
          path: ["models", index, "profile"],
        });
      }
    }

    const chat = driver.defaults?.chat;
    if (chat && !driver.models.some((entry) => entry.id === chat)) {
      context.addIssue({
        code: "custom",
        message: `The default model "${chat}" is not listed.`,
        path: ["defaults", "chat"],
      });
    }
    const customProfile = driver.defaults?.customModelProfile;
    if (customProfile && !driver.profiles[customProfile]) {
      context.addIssue({
        code: "custom",
        message: `Unknown profile "${customProfile}".`,
        path: ["defaults", "customModelProfile"],
      });
    }
  });

export const engineManifestSchema = z.object({
  compatibility: z.array(engineCompatibilityPolicySchema).max(200).default([]),
  drivers: z.record(driverKindSchema, engineManifestDriverSchema).default({}),
  schemaVersion: z.literal(ENGINE_MANIFEST_SCHEMA_VERSION),
  /**
   * When the manifest was last edited. A cached or fetched copy older than
   * the bundled one never replaces it.
   */
  updatedAt: z.iso.datetime(),
});

export type EngineCompatibilityStatus = z.infer<
  typeof engineCompatibilityStatusSchema
>;
export type EngineCompatibilityPolicy = z.infer<
  typeof engineCompatibilityPolicySchema
>;
export type EngineManifestProfile = z.infer<typeof engineManifestProfileSchema>;
export type EngineManifestModel = z.infer<typeof engineManifestModelSchema>;
export type EngineManifestDriver = z.infer<typeof engineManifestDriverSchema>;
export type EngineManifest = z.infer<typeof engineManifestSchema>;

/** A manifest from untrusted input, or null when it does not validate. */
export function parseEngineManifest(value: unknown): EngineManifest | null {
  const parsed = engineManifestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Epoch milliseconds of `updatedAt` (0 when unparsable). */
export function getManifestUpdatedAtMs(
  manifest: Pick<EngineManifest, "updatedAt">,
) {
  const parsed = Date.parse(manifest.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

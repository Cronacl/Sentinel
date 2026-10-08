import "server-only";

import path from "node:path";

import { and, count, eq, isNull, or, type SQL } from "drizzle-orm";
import type {
  AnySQLiteColumn,
  BaseSQLiteDatabase,
} from "drizzle-orm/sqlite-core";

import { decrypt, encrypt } from "@/lib/ai/providers/encrypt";
import { getSentinelStateRoot } from "@/lib/runtime/local-state";
import {
  buildPreferredExecutablePathValue,
  getPlatformHomeDirectory,
} from "@/lib/runtime/platform-paths";
import { db as defaultDb } from "@/server/db";
import type { ChatEngine } from "@/server/db/enums";
import type * as schema from "@/server/db/schema";
import {
  automations,
  engineInstances,
  threads,
  users,
} from "@/server/db/schema";

import {
  BUILTIN_DRIVER_KINDS,
  getDriverMeta,
  isDefaultInstanceId,
  listDefaultInstanceDrivers,
  type EngineDriverMeta,
} from "../catalog";
import {
  ENGINE_SLUG,
  MAX_ENGINE_CUSTOM_MODELS,
  MAX_ENGINE_ENV_VARS,
  customEngineModelSchema,
  defaultInstanceIdForDriver,
  engineAccentColorSchema,
  engineEnvVarInputSchema,
  engineInstanceLabelSchema,
  storedEngineEnvVarSchema,
  type BaseInstanceConfig,
  type CreateEngineInstanceInput,
  type CustomEngineModel,
  type DriverKind,
  type EngineEnvVarInput,
  type EngineInstanceSummary,
  type EngineInstanceUnavailableReason,
  type EngineTarget,
  type RedactedEngineEnvVar,
  type ResolvedEngineInstance,
  type StoredEngineEnvVar,
  type UnavailableEngineInstance,
  type UpdateEngineInstanceInput,
} from "../contract";
import {
  EngineInstanceError,
  EngineInstanceUnavailableError,
  countEngineInstanceReferences,
  type EngineInstanceReferences,
} from "./errors";
import { getEngineInstanceStateDirectory } from "./paths";
import {
  getRuntimePathsStore,
  type RuntimePathsStore,
} from "./runtime/paths-cache";
import { getConfiguredBinaryOverride } from "./runtime/resolve-binary";

export type {
  CreateEngineInstanceInput,
  UpdateEngineInstanceInput,
} from "../contract";

// Engine instances: rows in engine_instance merged with a synthesized
// default instance (id = driver kind) for every implemented driver that has
// none. Threads, automations and the user default point at an instance id;
// NULL there means the default instance, so rows written before instances
// existed resolve without a backfill.

export type EngineInstanceDb = BaseSQLiteDatabase<
  "sync",
  unknown,
  typeof schema
>;

export type EngineInstanceChange = {
  driver: DriverKind;
  instanceId: string;
  type: "created" | "removed" | "updated";
};

export type EngineInstanceRegistryDeps = {
  db: EngineInstanceDb;
  decrypt(ciphertext: string): string;
  encrypt(plaintext: string): string;
  env?: () => Record<string, string | undefined>;
  now?: () => Date;
  onChange?: (change: EngineInstanceChange) => void;
  platform?: NodeJS.Platform;
  runtimePaths?: Pick<RuntimePathsStore, "remove">;
  stateRoot?: () => string;
};

export type EngineInstanceLookup =
  | { instance: ResolvedEngineInstance; status: "available" }
  | { instance: UnavailableEngineInstance; status: "unavailable" };

export interface EngineInstanceRegistry {
  /** Every instance, available or not, redacted for the UI. */
  listSummaries(userId: string): Promise<EngineInstanceSummary[]>;
  /** Instances that can be resolved (enabled or not). */
  list(userId: string): Promise<ResolvedEngineInstance[]>;
  get(userId: string, instanceId: string): Promise<EngineInstanceLookup | null>;
  /**
   * The instance a run should use. A missing instance id means the driver's
   * default instance. Throws EngineInstanceUnavailableError.
   */
  resolve(
    userId: string,
    target: { driver: DriverKind; instanceId?: string | null },
  ): Promise<ResolvedEngineInstance>;
  create(
    userId: string,
    input: CreateEngineInstanceInput,
  ): Promise<EngineInstanceSummary>;
  /** Updating a synthesized default instance persists it. */
  update(
    userId: string,
    instanceId: string,
    patch: UpdateEngineInstanceInput,
  ): Promise<EngineInstanceSummary>;
  /**
   * Deletes a row. A default instance's row is a reset to the driver's
   * defaults. Refused while threads, automations or the user default use
   * the instance, unless `force`. A forced removal leaves threads and
   * automations pointing at the missing instance (they resolve to
   * engine_unavailable) and moves the user default to the driver's default
   * instance.
   */
  remove(
    userId: string,
    instanceId: string,
    options?: { force?: boolean },
  ): Promise<{ reset: boolean }>;
  /** Disabling an instance in use needs `force`. */
  setEnabled(
    userId: string,
    instanceId: string,
    enabled: boolean,
    options?: { force?: boolean },
  ): Promise<EngineInstanceSummary>;
  countReferences(
    userId: string,
    target: EngineTarget,
  ): Promise<EngineInstanceReferences>;
}

type InstanceRecord = {
  accentColor: string | null;
  binaryPath: string | null;
  config: Record<string, unknown>;
  customModels: CustomEngineModel[];
  driver: string;
  enabled: boolean;
  environment: StoredEngineEnvVar[];
  homePath: string | null;
  id: string;
  label: string | null;
  persisted: boolean;
  sortOrder: number;
};

type Decoded =
  | {
      availability: "available";
      config: BaseInstanceConfig & Record<string, unknown>;
      meta: EngineDriverMeta;
    }
  | {
      availability: "unavailable";
      message: string;
      reason: EngineInstanceUnavailableReason;
    };

const MAX_ID_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function driverOrder(driver: string) {
  const index = (BUILTIN_DRIVER_KINDS as readonly string[]).indexOf(driver);
  return index === -1 ? BUILTIN_DRIVER_KINDS.length : index;
}

function compareRecords(left: InstanceRecord, right: InstanceRecord) {
  return (
    driverOrder(left.driver) - driverOrder(right.driver) ||
    left.driver.localeCompare(right.driver) ||
    Number(isDefaultInstanceId(right.id, right.driver)) -
      Number(isDefaultInstanceId(left.id, left.driver)) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id)
  );
}

function parseStoredEnvironment(value: unknown): StoredEngineEnvVar[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const parsed = storedEngineEnvVarSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseStoredCustomModels(value: unknown): CustomEngineModel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const parsed = customEngineModelSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function withoutUndefined(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export function createEngineInstanceRegistry(
  deps: EngineInstanceRegistryDeps,
): EngineInstanceRegistry {
  // platform-paths helpers take NodeJS.ProcessEnv; tests inject a plain map.
  const getEnv = () => (deps.env?.() ?? process.env) as NodeJS.ProcessEnv;
  const now = deps.now ?? (() => new Date());
  const platform = deps.platform ?? process.platform;
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const stateRoot = deps.stateRoot ?? (() => getSentinelStateRoot());

  function expandHome(value: string) {
    const trimmed = value.trim();
    if (
      trimmed === "~" ||
      trimmed.startsWith("~/") ||
      trimmed.startsWith("~\\")
    ) {
      const home = getPlatformHomeDirectory({ env: getEnv(), platform });
      return pathModule.join(home, trimmed.slice(1));
    }
    return trimmed;
  }

  function synthesizeDefault(driver: string): InstanceRecord {
    const meta = getDriverMeta(driver)!;
    return {
      accentColor: null,
      binaryPath: null,
      config: {},
      customModels: [],
      driver,
      enabled: true,
      environment: [],
      homePath: null,
      id: defaultInstanceIdForDriver(driver),
      label: meta.label,
      persisted: false,
      sortOrder: 0,
    };
  }

  function rowToRecord(
    row: typeof engineInstances.$inferSelect,
  ): InstanceRecord {
    return {
      accentColor: row.accentColor ?? null,
      binaryPath: row.binaryPath ?? null,
      config: isRecord(row.config) ? row.config : {},
      customModels: parseStoredCustomModels(row.customModels),
      driver: row.driver,
      enabled: row.enabled,
      environment: parseStoredEnvironment(row.environment),
      homePath: row.homePath ?? null,
      id: row.id,
      label: row.label ?? null,
      persisted: true,
      sortOrder: row.sortOrder,
    };
  }

  function readRows(userId: string) {
    return deps.db
      .select()
      .from(engineInstances)
      .where(eq(engineInstances.userId, userId))
      .all()
      .map(rowToRecord);
  }

  function readRecords(userId: string) {
    const records = readRows(userId);
    const ids = new Set(records.map((record) => record.id));
    for (const driver of listDefaultInstanceDrivers()) {
      if (!ids.has(defaultInstanceIdForDriver(driver))) {
        records.push(synthesizeDefault(driver));
      }
    }
    return records.sort(compareRecords);
  }

  function readRecord(userId: string, instanceId: string) {
    const row = deps.db
      .select()
      .from(engineInstances)
      .where(
        and(
          eq(engineInstances.userId, userId),
          eq(engineInstances.id, instanceId),
        ),
      )
      .get();
    if (row) {
      return rowToRecord(row);
    }

    const meta = getDriverMeta(instanceId);
    return meta?.status === "available" && meta.defaultInstance
      ? synthesizeDefault(instanceId)
      : null;
  }

  function decodeRecord(record: InstanceRecord): Decoded {
    const meta = getDriverMeta(record.driver);
    if (!meta) {
      return {
        availability: "unavailable",
        message: `This build has no "${record.driver}" engine driver.`,
        reason: "driver-unknown",
      };
    }
    if (meta.status !== "available") {
      return {
        availability: "unavailable",
        message: `${meta.label} is not available in this build yet.`,
        reason: "driver-planned",
      };
    }

    const ownsDefaultId = getDriverMeta(record.id) !== null;
    if (ownsDefaultId && record.id !== record.driver) {
      return {
        availability: "unavailable",
        message: `Instance "${record.id}" is reserved for the ${record.id} driver.`,
        reason: "driver-mismatch",
      };
    }

    const parsed = meta.config.safeParse(
      withoutUndefined({
        ...record.config,
        binaryPath: record.binaryPath ?? undefined,
        homePath: record.homePath ?? undefined,
      }),
    );
    if (!parsed.success) {
      return {
        availability: "unavailable",
        message: `The saved ${meta.label} configuration is invalid.`,
        reason: "config-invalid",
      };
    }

    return {
      availability: "available",
      config: parsed.data as BaseInstanceConfig & Record<string, unknown>,
      meta,
    };
  }

  function tryDecrypt(value: string) {
    try {
      return deps.decrypt(value);
    } catch {
      return null;
    }
  }

  /**
   * Plain values by name, plus the names whose encrypted value no longer
   * decrypts (encrypted with another key: restored backup, reset
   * desktop.env). Those need re-entry in Settings → Engines.
   */
  function decryptEnvironment(environment: StoredEngineEnvVar[]) {
    const values: Record<string, string> = {};
    const unreadable: string[] = [];
    for (const variable of environment) {
      const value = variable.encrypted
        ? tryDecrypt(variable.value)
        : variable.value;
      if (value === null) {
        unreadable.push(variable.name);
      } else {
        values[variable.name] = value;
      }
    }
    return { unreadable, values };
  }

  function redactEnvironment(
    environment: StoredEngineEnvVar[],
  ): RedactedEngineEnvVar[] {
    return environment.map((variable) => {
      const needsReentry =
        variable.encrypted && tryDecrypt(variable.value) === null;
      return variable.sensitive
        ? {
            name: variable.name,
            needsReentry,
            sensitive: true,
            value: "",
            valueRedacted: true,
          }
        : {
            name: variable.name,
            needsReentry,
            sensitive: false,
            value: variable.encrypted ? "" : variable.value,
            valueRedacted: variable.encrypted,
          };
    });
  }

  function toResolved(
    record: InstanceRecord,
    decoded: Extract<Decoded, { availability: "available" }>,
  ): ResolvedEngineInstance {
    const { config, meta } = decoded;
    const baseEnv = getEnv();
    const { unreadable, values: instanceEnv } = decryptEnvironment(
      record.environment,
    );
    const env: Record<string, string | undefined> = { ...baseEnv };
    // A variable the instance sets but cannot decrypt must not fall back to
    // the global value: an instance meant for a second account would run on
    // the default one. It stays unset until re-entered.
    for (const name of unreadable) {
      delete env[name];
    }
    env.PATH = buildPreferredExecutablePathValue(baseEnv.PATH, {
      env: baseEnv,
      platform,
    });

    const configuredHome = config.homePath ? expandHome(config.homePath) : null;
    const envOverrides: Record<string, string> = {};
    if (meta.homeEnvVar && configuredHome) {
      envOverrides[meta.homeEnvVar] = configuredHome;
    }
    Object.assign(envOverrides, instanceEnv);
    Object.assign(env, envOverrides);

    const effectiveHome = meta.homeEnvVar
      ? (instanceEnv[meta.homeEnvVar] ?? configuredHome)
      : null;
    const continuationKey =
      meta.kind === "acp"
        ? `acp:${String(config.agentId)}:instance:${record.id}`
        : effectiveHome
          ? `${meta.kind}:home:${pathModule.resolve(effectiveHome)}`
          : `${meta.kind}:instance:${record.id}`;

    return {
      accentColor: record.accentColor,
      config: {
        ...config,
        ...(config.binaryPath
          ? { binaryPath: expandHome(config.binaryPath) }
          : {}),
        ...(configuredHome ? { homePath: configuredHome } : {}),
      },
      continuationKey,
      customModels: record.customModels,
      driver: record.driver,
      enabled: record.enabled,
      env,
      envOverrides,
      envUnset: unreadable,
      id: record.id,
      isDefault: isDefaultInstanceId(record.id, record.driver),
      label: record.label ?? meta.label,
      sortOrder: record.sortOrder,
      stateDir: getEngineInstanceStateDirectory(record.id, {
        pathModule,
        stateRoot: stateRoot(),
      }),
    };
  }

  function toUnavailable(
    record: InstanceRecord,
    decoded: Extract<Decoded, { availability: "unavailable" }>,
  ): UnavailableEngineInstance {
    return {
      driver: record.driver,
      id: record.id,
      label:
        record.label ?? getDriverMeta(record.driver)?.label ?? record.driver,
      message: decoded.message,
      reason: decoded.reason,
    };
  }

  function toSummary(record: InstanceRecord): EngineInstanceSummary {
    const decoded = decodeRecord(record);
    const meta = getDriverMeta(record.driver);
    return {
      accentColor: record.accentColor,
      availability: decoded.availability,
      config:
        decoded.availability === "available"
          ? decoded.config
          : withoutUndefined({
              ...record.config,
              binaryPath: record.binaryPath ?? undefined,
              homePath: record.homePath ?? undefined,
            }),
      customModels: record.customModels,
      driver: record.driver,
      enabled: record.enabled,
      environment: redactEnvironment(record.environment),
      id: record.id,
      isDefault: isDefaultInstanceId(record.id, record.driver),
      label: record.label ?? meta?.label ?? record.driver,
      persisted: record.persisted,
      sortOrder: record.sortOrder,
      unavailableReason:
        decoded.availability === "available" ? null : decoded.reason,
    };
  }

  function lookup(record: InstanceRecord): EngineInstanceLookup {
    const decoded = decodeRecord(record);
    return decoded.availability === "available"
      ? { instance: toResolved(record, decoded), status: "available" }
      : { instance: toUnavailable(record, decoded), status: "unavailable" };
  }

  function instanceMatch(
    target: EngineTarget,
    engineColumn: AnySQLiteColumn,
    instanceColumn: AnySQLiteColumn,
  ): SQL {
    const byId = eq(instanceColumn, target.instanceId);
    if (!isDefaultInstanceId(target.instanceId, target.driver)) {
      return byId;
    }
    return or(
      byId,
      and(isNull(instanceColumn), eq(engineColumn, target.driver)),
    )!;
  }

  function countReferencesSync(
    userId: string,
    target: EngineTarget,
  ): EngineInstanceReferences {
    const threadCount =
      deps.db
        .select({ value: count() })
        .from(threads)
        .where(
          and(
            eq(threads.userId, userId),
            isNull(threads.archivedAt),
            instanceMatch(
              target,
              threads.chatEngine,
              threads.chatEngineInstanceId,
            ),
          ),
        )
        .get()?.value ?? 0;
    const automationCount =
      deps.db
        .select({ value: count() })
        .from(automations)
        .where(
          and(
            eq(automations.userId, userId),
            instanceMatch(
              target,
              automations.chatEngine,
              automations.chatEngineInstanceId,
            ),
          ),
        )
        .get()?.value ?? 0;
    const userDefault =
      (deps.db
        .select({ value: count() })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            isDefaultInstanceId(target.instanceId, target.driver)
              ? or(
                  eq(users.defaultChatEngineInstanceId, target.instanceId),
                  and(
                    isNull(users.defaultChatEngineInstanceId),
                    eq(users.defaultChatEngine, target.driver as ChatEngine),
                  ),
                )
              : eq(users.defaultChatEngineInstanceId, target.instanceId),
          ),
        )
        .get()?.value ?? 0) > 0;

    return {
      automations: automationCount,
      threads: threadCount,
      userDefault,
    };
  }

  function assertAbsolutePath(value: unknown, field: string, issues: string[]) {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }
    if (!pathModule.isAbsolute(expandHome(value))) {
      issues.push(`${field} must be an absolute path (or start with ~/).`);
    }
  }

  function validateConfig(meta: EngineDriverMeta, config: unknown) {
    const input = isRecord(config) ? config : {};
    const parsed = meta.config.safeParse(input);
    const issues: string[] = [];
    if (!parsed.success) {
      issues.push(
        ...parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
        ),
      );
    } else {
      assertAbsolutePath(parsed.data.binaryPath, "binaryPath", issues);
      assertAbsolutePath(parsed.data.homePath, "homePath", issues);
    }
    if (issues.length > 0 || !parsed.success) {
      throw new EngineInstanceError(
        "invalid",
        `Invalid ${meta.label} configuration.`,
        { issues },
      );
    }

    const { binaryPath, homePath, ...rest } =
      parsed.data as BaseInstanceConfig & Record<string, unknown>;
    return {
      binaryPath: typeof binaryPath === "string" ? binaryPath.trim() : null,
      config: withoutUndefined(rest),
      homePath: typeof homePath === "string" ? homePath.trim() : null,
    };
  }

  function encodeEnvironment(
    input: EngineEnvVarInput[],
    previous: StoredEngineEnvVar[],
  ): StoredEngineEnvVar[] {
    if (input.length > MAX_ENGINE_ENV_VARS) {
      throw new EngineInstanceError(
        "invalid",
        `At most ${MAX_ENGINE_ENV_VARS} environment variables are allowed.`,
      );
    }

    const seen = new Set<string>();
    const previousByName = new Map(
      previous.map((entry) => [entry.name, entry]),
    );

    return input.map((raw) => {
      const parsed = engineEnvVarInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new EngineInstanceError(
          "invalid",
          `Invalid environment variable "${String(raw?.name ?? "")}".`,
          { issues: parsed.error.issues.map((issue) => issue.message) },
        );
      }
      const variable = parsed.data;
      if (seen.has(variable.name)) {
        throw new EngineInstanceError(
          "invalid",
          `Environment variable ${variable.name} is listed twice.`,
        );
      }
      seen.add(variable.name);

      let plaintext = variable.value;
      const stored = previousByName.get(variable.name);
      // A stored value is only kept under its own name: a redacted echo for
      // a name with nothing stored (a renamed row) would store an empty
      // value that overrides the app's own.
      if (variable.valueRedacted && !variable.value && !stored) {
        throw new EngineInstanceError(
          "invalid",
          `There is no stored value of ${variable.name} to keep. Enter its value.`,
        );
      }
      if (variable.valueRedacted && !variable.value && stored) {
        if (stored.encrypted && variable.sensitive) {
          return { ...stored, sensitive: true };
        }
        // Unticking "sensitive" must not reveal a stored secret: turning it
        // into a plain variable takes a freshly entered value.
        if ((stored.sensitive || stored.encrypted) && !variable.sensitive) {
          throw new EngineInstanceError(
            "invalid",
            `Enter a new value for ${variable.name} to store it as a plain variable.`,
          );
        }
        try {
          plaintext = stored.encrypted
            ? deps.decrypt(stored.value)
            : stored.value;
        } catch {
          plaintext = "";
        }
      }

      return variable.sensitive
        ? {
            encrypted: true,
            name: variable.name,
            sensitive: true,
            value: deps.encrypt(plaintext),
          }
        : {
            encrypted: false,
            name: variable.name,
            sensitive: false,
            value: plaintext,
          };
    });
  }

  function validateCustomModels(input: CustomEngineModel[]) {
    if (input.length > MAX_ENGINE_CUSTOM_MODELS) {
      throw new EngineInstanceError(
        "invalid",
        `At most ${MAX_ENGINE_CUSTOM_MODELS} custom models are allowed.`,
      );
    }
    const seen = new Set<string>();
    return input.map((raw) => {
      const parsed = customEngineModelSchema.safeParse(raw);
      if (!parsed.success) {
        throw new EngineInstanceError(
          "invalid",
          `Invalid custom model "${String(raw?.id ?? "")}".`,
          { issues: parsed.error.issues.map((issue) => issue.message) },
        );
      }
      if (seen.has(parsed.data.id)) {
        throw new EngineInstanceError(
          "invalid",
          `Custom model ${parsed.data.id} is listed twice.`,
        );
      }
      seen.add(parsed.data.id);
      return parsed.data;
    });
  }

  function validateLabel(label: string | undefined) {
    if (label === undefined) {
      return undefined;
    }
    const parsed = engineInstanceLabelSchema.safeParse(label);
    if (!parsed.success) {
      throw new EngineInstanceError(
        "invalid",
        "Instance names must be 1 to 64 characters.",
      );
    }
    return parsed.data;
  }

  function validateSortOrder(sortOrder: number | undefined) {
    if (
      sortOrder !== undefined &&
      (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000)
    ) {
      throw new EngineInstanceError(
        "invalid",
        "Sort order must be an integer from 0 to 100000.",
      );
    }
    return sortOrder;
  }

  function validateAccentColor(accentColor: string | null | undefined) {
    if (accentColor == null) {
      return accentColor;
    }
    if (!engineAccentColorSchema.safeParse(accentColor).success) {
      throw new EngineInstanceError(
        "invalid",
        "Accent colors must be #rrggbb hex values.",
      );
    }
    return accentColor.toLowerCase();
  }

  function requireImplementedDriver(driver: string) {
    const meta = getDriverMeta(driver);
    if (!meta) {
      throw new EngineInstanceError(
        "invalid",
        `Unknown engine driver "${driver}".`,
      );
    }
    if (meta.status !== "available") {
      throw new EngineInstanceError(
        "unsupported",
        `${meta.label} is not available in this build yet.`,
      );
    }
    return meta;
  }

  function nextInstanceId(driver: string, label: string, taken: Set<string>) {
    const slug = slugify(label) || "instance";
    // "Claude 2" → claude-2, "Work" → codex-work.
    const base = (
      slug === driver || slug.startsWith(`${driver}-`)
        ? slug
        : `${driver}-${slug}`
    ).slice(0, MAX_ID_LENGTH - 4);
    for (let suffix = 1; suffix < 1000; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base}-${suffix}`;
      if (!taken.has(candidate) && getDriverMeta(candidate) === null) {
        return candidate;
      }
    }
    throw new EngineInstanceError(
      "conflict",
      "Could not allocate an instance id.",
    );
  }

  function emit(change: EngineInstanceChange) {
    try {
      deps.onChange?.(change);
    } catch {
      // Listeners must not break instance mutations.
    }
  }

  function requireRecord(userId: string, instanceId: string) {
    const record = readRecord(userId, instanceId);
    if (!record) {
      throw new EngineInstanceError(
        "not-found",
        `Engine instance "${instanceId}" does not exist.`,
      );
    }
    return record;
  }

  function assertMutableRuntime(record: InstanceRecord) {
    if (getDriverMeta(record.driver)?.runtime === "builtin") {
      throw new EngineInstanceError(
        "unsupported",
        "Sentinel's built-in engine cannot be disabled or removed.",
      );
    }
  }

  function assertNotInUse(
    userId: string,
    record: InstanceRecord,
    action: "disable" | "remove",
    force: boolean | undefined,
  ) {
    const references = countReferencesSync(userId, {
      driver: record.driver,
      instanceId: record.id,
    });
    if (!force && countEngineInstanceReferences(references) > 0) {
      throw new EngineInstanceError(
        "in-use",
        `Engine instance "${record.id}" is in use; ${action} it with force to continue.`,
        { references },
      );
    }
  }

  async function forgetResolvedBinary(instanceId: string) {
    try {
      await (deps.runtimePaths ?? getRuntimePathsStore()).remove(instanceId);
    } catch {
      // A stale cache entry is re-validated on the next resolve.
    }
  }

  return {
    async listSummaries(userId) {
      return readRecords(userId).map(toSummary);
    },

    async list(userId) {
      return readRecords(userId).flatMap((record) => {
        const result = lookup(record);
        return result.status === "available" ? [result.instance] : [];
      });
    },

    async get(userId, instanceId) {
      const record = readRecord(userId, instanceId);
      return record ? lookup(record) : null;
    },

    async resolve(userId, target) {
      const instanceId =
        target.instanceId ?? defaultInstanceIdForDriver(target.driver);
      const meta = getDriverMeta(target.driver);
      const unavailable = (
        reason: EngineInstanceUnavailableReason,
        message: string,
      ) =>
        new EngineInstanceUnavailableError(
          instanceId,
          target.driver,
          reason,
          message,
        );

      if (!meta) {
        throw unavailable(
          "driver-unknown",
          `This build has no "${target.driver}" engine driver.`,
        );
      }
      if (meta.status !== "available") {
        throw unavailable(
          "driver-planned",
          `${meta.label} is not available in this build yet.`,
        );
      }
      if (target.instanceId == null && !meta.defaultInstance) {
        throw unavailable(
          "no-default-instance",
          `${meta.label} has no default instance; pick a configured one.`,
        );
      }

      const record = readRecord(userId, instanceId);
      if (!record) {
        throw unavailable(
          "missing",
          `Engine instance "${instanceId}" no longer exists.`,
        );
      }
      if (record.driver !== target.driver) {
        throw unavailable(
          "driver-mismatch",
          `Engine instance "${instanceId}" belongs to ${record.driver}, not ${target.driver}.`,
        );
      }

      const decoded = decodeRecord(record);
      if (decoded.availability === "unavailable") {
        throw unavailable(decoded.reason, decoded.message);
      }
      if (!record.enabled) {
        throw unavailable(
          "disabled",
          `${record.label ?? meta.label} is disabled in Settings → Engines.`,
        );
      }

      return toResolved(record, decoded);
    },

    async create(userId, input) {
      const meta = requireImplementedDriver(input.driver);
      const records = readRecords(userId);
      const taken = new Set(records.map((record) => record.id));
      const siblings = records.filter(
        (record) => record.driver === input.driver,
      );

      if (!meta.multiInstance && siblings.length > 0) {
        throw new EngineInstanceError(
          "unsupported",
          `${meta.label} supports a single instance.`,
        );
      }

      const label =
        validateLabel(input.label) ?? `${meta.label} ${siblings.length + 1}`;
      let id = input.id;
      if (id !== undefined) {
        if (!ENGINE_SLUG.test(id)) {
          throw new EngineInstanceError(
            "invalid",
            "Instance ids are lowercase slugs (a-z, 0-9, - and _).",
          );
        }
        if (getDriverMeta(id) !== null) {
          throw new EngineInstanceError(
            "conflict",
            `"${id}" is reserved for the default ${id} instance.`,
          );
        }
        if (taken.has(id)) {
          throw new EngineInstanceError(
            "conflict",
            `Engine instance "${id}" already exists.`,
          );
        }
      } else {
        id = nextInstanceId(input.driver, label, taken);
      }

      const { binaryPath, config, homePath } = validateConfig(
        meta,
        input.config,
      );
      const timestamp = now();
      deps.db
        .insert(engineInstances)
        .values({
          accentColor: validateAccentColor(input.accentColor) ?? null,
          binaryPath,
          config,
          createdAt: timestamp,
          customModels: validateCustomModels(input.customModels ?? []),
          driver: input.driver,
          enabled: input.enabled ?? true,
          environment: encodeEnvironment(input.environment ?? [], []),
          homePath,
          id,
          label,
          sortOrder:
            Math.max(0, ...siblings.map((record) => record.sortOrder)) + 1,
          updatedAt: timestamp,
          userId,
        })
        .run();

      emit({ driver: input.driver, instanceId: id, type: "created" });
      return toSummary(requireRecord(userId, id));
    },

    async update(userId, instanceId, patch) {
      const record = requireRecord(userId, instanceId);
      const meta = requireImplementedDriver(record.driver);
      if (patch.enabled === false && record.enabled) {
        assertMutableRuntime(record);
        assertNotInUse(userId, record, "disable", false);
      }

      const nextConfig =
        patch.config === undefined ? null : validateConfig(meta, patch.config);
      const label = validateLabel(patch.label);
      const accentColor = validateAccentColor(patch.accentColor);
      const values = withoutUndefined({
        accentColor,
        binaryPath: nextConfig?.binaryPath,
        config: nextConfig?.config,
        customModels:
          patch.customModels === undefined
            ? undefined
            : validateCustomModels(patch.customModels),
        enabled: patch.enabled,
        environment:
          patch.environment === undefined
            ? undefined
            : encodeEnvironment(patch.environment, record.environment),
        homePath: nextConfig?.homePath,
        label,
        sortOrder: validateSortOrder(patch.sortOrder),
      });

      const timestamp = now();
      if (record.persisted) {
        deps.db
          .update(engineInstances)
          .set({ ...values, updatedAt: timestamp })
          .where(
            and(
              eq(engineInstances.userId, userId),
              eq(engineInstances.id, instanceId),
            ),
          )
          .run();
      } else {
        deps.db
          .insert(engineInstances)
          .values({
            accentColor: record.accentColor,
            binaryPath: record.binaryPath,
            config: record.config,
            createdAt: timestamp,
            customModels: record.customModels,
            driver: record.driver,
            enabled: record.enabled,
            environment: record.environment,
            homePath: record.homePath,
            id: record.id,
            label: null,
            sortOrder: record.sortOrder,
            ...values,
            updatedAt: timestamp,
            userId,
          })
          .run();
      }

      if (
        nextConfig &&
        (nextConfig.binaryPath !== record.binaryPath ||
          nextConfig.homePath !== record.homePath)
      ) {
        await forgetResolvedBinary(instanceId);
      }

      emit({ driver: record.driver, instanceId, type: "updated" });
      return toSummary(requireRecord(userId, instanceId));
    },

    async remove(userId, instanceId, options) {
      const record = requireRecord(userId, instanceId);
      assertMutableRuntime(record);
      const isDefault = isDefaultInstanceId(record.id, record.driver);

      if (!record.persisted) {
        // A synthesized default has nothing to reset.
        return { reset: isDefault };
      }

      assertNotInUse(userId, record, "remove", options?.force);
      deps.db.transaction((tx) => {
        tx.delete(engineInstances)
          .where(
            and(
              eq(engineInstances.userId, userId),
              eq(engineInstances.id, instanceId),
            ),
          )
          .run();
        if (!isDefault) {
          // NULL: the default instance of the user's default driver.
          tx.update(users)
            .set({ defaultChatEngineInstanceId: null })
            .where(
              and(
                eq(users.id, userId),
                eq(users.defaultChatEngineInstanceId, instanceId),
              ),
            )
            .run();
        }
      });
      await forgetResolvedBinary(instanceId);

      emit({
        driver: record.driver,
        instanceId,
        type: isDefault ? "updated" : "removed",
      });
      return { reset: isDefault };
    },

    async setEnabled(userId, instanceId, enabled, options) {
      const record = requireRecord(userId, instanceId);
      if (!enabled && record.enabled) {
        assertMutableRuntime(record);
        assertNotInUse(userId, record, "disable", options?.force);
      }
      if (record.enabled === enabled) {
        return toSummary(record);
      }

      if (record.persisted) {
        deps.db
          .update(engineInstances)
          .set({ enabled, updatedAt: now() })
          .where(
            and(
              eq(engineInstances.userId, userId),
              eq(engineInstances.id, instanceId),
            ),
          )
          .run();
      } else {
        const timestamp = now();
        deps.db
          .insert(engineInstances)
          .values({
            config: {},
            createdAt: timestamp,
            customModels: [],
            driver: record.driver,
            enabled,
            environment: [],
            id: record.id,
            sortOrder: record.sortOrder,
            updatedAt: timestamp,
            userId,
          })
          .run();
      }

      emit({ driver: record.driver, instanceId, type: "updated" });
      return toSummary(requireRecord(userId, instanceId));
    },

    async countReferences(userId, target) {
      return countReferencesSync(userId, target);
    },
  };
}

export type EngineInstanceChangeListener = (
  change: EngineInstanceChange,
) => void;

// On globalThis so dev-server module duplication (HMR) shares one registry
// and one listener set.
const globalForEngineInstances = globalThis as unknown as {
  __sentinelEngineInstanceListeners?: Set<EngineInstanceChangeListener>;
  __sentinelEngineInstanceRegistry?: EngineInstanceRegistry;
};

function getChangeListeners() {
  globalForEngineInstances.__sentinelEngineInstanceListeners ??= new Set();
  return globalForEngineInstances.__sentinelEngineInstanceListeners;
}

/**
 * Called after the process-wide registry creates, updates or removes an
 * instance (the snapshot service refreshes on it). Returns an unsubscribe.
 */
export function subscribeToEngineInstanceChanges(
  listener: EngineInstanceChangeListener,
) {
  const listeners = getChangeListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyEngineInstanceChange(change: EngineInstanceChange) {
  for (const listener of getChangeListeners()) {
    try {
      listener(change);
    } catch {
      // One failing listener must not starve the others.
    }
  }
}

export function getEngineInstanceRegistry(): EngineInstanceRegistry {
  globalForEngineInstances.__sentinelEngineInstanceRegistry ??=
    createEngineInstanceRegistry({
      db: defaultDb,
      decrypt,
      encrypt,
      onChange: notifyEngineInstanceChange,
    });
  return globalForEngineInstances.__sentinelEngineInstanceRegistry;
}

/**
 * The binary an instance is configured to run, before discovery: the
 * instance's binaryPath, else (default instance only) the first legacy
 * SENTINEL_<X>_PATH-style variable in the environment.
 */
export function getConfiguredEngineBinary(
  instance: Pick<
    ResolvedEngineInstance,
    "config" | "driver" | "env" | "isDefault"
  >,
): { path: string; source: "config" | "env" } | null {
  const override = getConfiguredBinaryOverride(
    instance,
    instance.env,
    getDriverMeta(instance.driver)?.legacyEnvPathKeys ?? [],
  );
  return override ? { path: override.path, source: override.source } : null;
}

import "server-only";

import { getDriverMeta } from "../../catalog";
import {
  ENGINE_ENV_VAR_NAME,
  MAX_ENGINE_ENV_VARS,
  type EngineEnvVarInput,
  type RedactedEngineEnvVar,
  type ResolvedEngineInstance,
} from "../../contract";
import type { EngineInstanceRegistry } from "../instances";
import { EngineAuthError } from "./controller";

// Credentials entered in a sign-in flow are stored as sensitive (encrypted)
// instance variables through the instance registry, like the env editor
// does: every other variable is echoed back unchanged (secrets as
// `valueRedacted`, so their stored value is kept).

/**
 * The environment update that sets `set` as secrets and drops `remove`,
 * keeping everything else as stored.
 */
export function mergeEngineInstanceSecrets(
  environment: readonly RedactedEngineEnvVar[],
  changes: { remove?: readonly string[]; set?: Record<string, string> },
): EngineEnvVarInput[] {
  const set = changes.set ?? {};
  for (const name of Object.keys(set)) {
    if (!ENGINE_ENV_VAR_NAME.test(name)) {
      throw new EngineAuthError(`"${name}" is not a valid variable name.`);
    }
  }

  const replaced = new Set([...Object.keys(set), ...(changes.remove ?? [])]);
  const kept: EngineEnvVarInput[] = environment
    .filter((variable) => !replaced.has(variable.name))
    .map((variable) =>
      variable.sensitive
        ? { name: variable.name, sensitive: true, valueRedacted: true }
        : { name: variable.name, sensitive: false, value: variable.value },
    );
  const added: EngineEnvVarInput[] = Object.entries(set).map(
    ([name, value]) => ({ name, sensitive: true, value }),
  );

  const next = [...kept, ...added];
  if (next.length > MAX_ENGINE_ENV_VARS) {
    throw new EngineAuthError(
      `An instance can have at most ${MAX_ENGINE_ENV_VARS} variables.`,
    );
  }
  return next;
}

/**
 * The instance's own variables that are not secret (its home variable
 * included), for a sign-in command that runs outside the server. Without
 * the redacted list only the home variable is known to be safe.
 */
export function getPublicInstanceOverrides(
  instance: Pick<ResolvedEngineInstance, "driver" | "envOverrides">,
  environment: readonly RedactedEngineEnvVar[] | null,
): Record<string, string> {
  const homeEnvVar = getDriverMeta(instance.driver)?.homeEnvVar ?? null;
  const declared = new Map(
    (environment ?? []).map((variable) => [variable.name, variable]),
  );

  return Object.fromEntries(
    Object.entries(instance.envOverrides).filter(([name]) => {
      const variable = declared.get(name);
      if (variable) {
        return !variable.sensitive;
      }
      // Not one of the instance's variables: the home path from its config.
      return name === homeEnvVar;
    }),
  );
}

export type EngineInstanceSecrets = {
  clear(
    userId: string,
    instanceId: string,
    names: readonly string[],
  ): Promise<string[]>;
  publicOverrides(
    userId: string,
    instance: ResolvedEngineInstance,
  ): Promise<Record<string, string>>;
  save(
    userId: string,
    instanceId: string,
    values: Record<string, string>,
  ): Promise<void>;
};

export function createEngineInstanceSecrets(
  registry: Pick<EngineInstanceRegistry, "listSummaries" | "update">,
): EngineInstanceSecrets {
  async function environmentOf(userId: string, instanceId: string) {
    const summary = (await registry.listSummaries(userId)).find(
      (candidate) => candidate.id === instanceId,
    );
    return summary?.environment ?? null;
  }

  return {
    async clear(userId, instanceId, names) {
      const environment = await environmentOf(userId, instanceId);
      const present = (environment ?? [])
        .filter((variable) => names.includes(variable.name))
        .map((variable) => variable.name);
      if (!environment || present.length === 0) {
        return [];
      }

      await registry.update(userId, instanceId, {
        environment: mergeEngineInstanceSecrets(environment, {
          remove: present,
        }),
      });
      return present;
    },

    async publicOverrides(userId, instance) {
      return getPublicInstanceOverrides(
        instance,
        await environmentOf(userId, instance.id).catch(() => null),
      );
    },

    async save(userId, instanceId, values) {
      const environment = await environmentOf(userId, instanceId);
      if (!environment) {
        throw new EngineAuthError("This engine instance no longer exists.");
      }

      await registry.update(userId, instanceId, {
        environment: mergeEngineInstanceSecrets(environment, { set: values }),
      });
    },
  };
}

import "server-only";

// Long-lived runtimes that belong to one engine instance (a Codex app-server
// process, a Copilot client and its runtime, later an OpenCode server): one
// per instance and runtime configuration (its key from
// getInstanceRuntimeKey). Drivers stay stateless; this map owns the
// processes.
//
// A lookup never ends another caller's runtime. Callers that resolved the
// instance and callers that pass none (a Codex review from the router, the
// commit-message helper) compute different keys for a customized default
// instance; if a lookup replaced the other key's runtime, they would kill
// each other's processes mid-turn. Runtimes of an older configuration are
// ended only when the instance change is handled (retire), when the
// instance goes away (dispose) and at shutdown (disposeAll).

export type InstanceResourceDisposer<R> = (resource: R) => Promise<void> | void;

export interface InstanceResourceMap<R> {
  /** The resource for `slot` (an instance id) and `key`, created when missing. */
  get(slot: string, key: string, create: () => R): R;
  /** The resource for `key`, or (without one) the slot's newest. */
  peek(slot: string, key?: string): R | null;
  /** Every live resource (for cache resets). */
  values(): R[];
  /** Ends the slot's resources created for any key but `keepKey`. */
  retire(slot: string, keepKey: string): Promise<void>;
  dispose(slot: string): Promise<void>;
  disposeAll(): Promise<void>;
}

export function createInstanceResourceMap<R>(options: {
  dispose: InstanceResourceDisposer<R>;
  onDisposeError?: (error: unknown, slot: string) => void;
}): InstanceResourceMap<R> {
  const slots = new Map<string, Map<string, R>>();

  async function disposeResource(slot: string, resource: R) {
    try {
      await options.dispose(resource);
    } catch (error) {
      options.onDisposeError?.(error, slot);
    }
  }

  async function disposeWhere(
    slot: string,
    shouldDispose: (key: string) => boolean,
  ) {
    const resources = slots.get(slot);
    if (!resources) {
      return;
    }

    const ended: R[] = [];
    for (const [key, resource] of [...resources]) {
      if (shouldDispose(key)) {
        resources.delete(key);
        ended.push(resource);
      }
    }
    if (resources.size === 0) {
      slots.delete(slot);
    }
    await Promise.all(ended.map((resource) => disposeResource(slot, resource)));
  }

  return {
    async dispose(slot) {
      await disposeWhere(slot, () => true);
    },

    async disposeAll() {
      await Promise.all(
        [...slots.keys()].map((slot) => disposeWhere(slot, () => true)),
      );
    },

    get(slot, key, create) {
      let resources = slots.get(slot);
      const existing = resources?.get(key);
      if (existing !== undefined) {
        return existing;
      }

      const resource = create();
      if (!resources) {
        resources = new Map();
        slots.set(slot, resources);
      }
      resources.set(key, resource);
      return resource;
    },

    peek(slot, key) {
      const resources = slots.get(slot);
      if (!resources) {
        return null;
      }
      if (key !== undefined) {
        return resources.get(key) ?? null;
      }
      return [...resources.values()].at(-1) ?? null;
    },

    async retire(slot, keepKey) {
      await disposeWhere(slot, (key) => key !== keepKey);
    },

    values() {
      return [...slots.values()].flatMap((resources) => [
        ...resources.values(),
      ]);
    },
  };
}

type AnyResourceMap = InstanceResourceMap<unknown>;

const globalForInstanceResources = globalThis as unknown as {
  __sentinelInstanceResources?: Map<string, AnyResourceMap>;
};

function getRegistry() {
  globalForInstanceResources.__sentinelInstanceResources ??= new Map();
  return globalForInstanceResources.__sentinelInstanceResources;
}

/**
 * The process-wide map for one kind of resource (on globalThis, so dev-server
 * HMR copies of a module share the same processes).
 */
export function getInstanceResources<R>(
  namespace: string,
  options: {
    dispose: InstanceResourceDisposer<R>;
    onDisposeError?: (error: unknown, slot: string) => void;
  },
): InstanceResourceMap<R> {
  const registry = getRegistry();
  let map = registry.get(namespace);
  if (!map) {
    map = createInstanceResourceMap<R>(options) as AnyResourceMap;
    registry.set(namespace, map);
  }
  return map as InstanceResourceMap<R>;
}

/**
 * Ends an instance's runtimes for older configurations once its change is
 * handled; the runtime for `keepKey` (the current configuration) stays.
 */
export async function retireInstanceResources(slot: string, keepKey: string) {
  await Promise.all(
    [...getRegistry().values()].map((map) => map.retire(slot, keepKey)),
  );
}

/** Ends every runtime an instance holds (it was removed or disabled). */
export async function disposeInstanceResources(slot: string) {
  await Promise.all(
    [...getRegistry().values()].map((map) => map.dispose(slot)),
  );
}

export async function disposeAllInstanceResources() {
  await Promise.all([...getRegistry().values()].map((map) => map.disposeAll()));
}

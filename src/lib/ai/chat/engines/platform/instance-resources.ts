import "server-only";

// Long-lived runtimes that belong to one engine instance (a Codex app-server
// process, a Copilot client and its runtime, later an OpenCode server): one
// per instance, replaced when the instance's runtime configuration changes
// (its key from getInstanceRuntimeKey) and disposed when the instance goes
// away. Drivers stay stateless; this map owns the processes.

export type InstanceResourceDisposer<R> = (resource: R) => Promise<void> | void;

export interface InstanceResourceMap<R> {
  /**
   * The resource for `slot` (an instance id), created when missing. A
   * resource created for another `key` (an older configuration) is disposed
   * and replaced.
   */
  get(slot: string, key: string, create: () => R): R;
  peek(slot: string): R | null;
  /** Every live resource (for cache resets). */
  values(): R[];
  dispose(slot: string): Promise<void>;
  disposeAll(): Promise<void>;
}

type Entry<R> = { key: string; resource: R };

export function createInstanceResourceMap<R>(options: {
  dispose: InstanceResourceDisposer<R>;
  onDisposeError?: (error: unknown, slot: string) => void;
}): InstanceResourceMap<R> {
  const entries = new Map<string, Entry<R>>();

  async function disposeEntry(slot: string, entry: Entry<R>) {
    try {
      await options.dispose(entry.resource);
    } catch (error) {
      options.onDisposeError?.(error, slot);
    }
  }

  return {
    async dispose(slot) {
      const entry = entries.get(slot);
      if (entry) {
        entries.delete(slot);
        await disposeEntry(slot, entry);
      }
    },

    async disposeAll() {
      const all = [...entries];
      entries.clear();
      await Promise.all(all.map(([slot, entry]) => disposeEntry(slot, entry)));
    },

    get(slot, key, create) {
      const existing = entries.get(slot);
      if (existing?.key === key) {
        return existing.resource;
      }

      const resource = create();
      entries.set(slot, { key, resource });
      if (existing) {
        void disposeEntry(slot, existing);
      }
      return resource;
    },

    peek(slot) {
      return entries.get(slot)?.resource ?? null;
    },

    values() {
      return [...entries.values()].map((entry) => entry.resource);
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

/** Ends every runtime an instance holds (it was removed or disabled). */
export async function disposeInstanceResources(slot: string) {
  await Promise.all(
    [...getRegistry().values()].map((map) => map.dispose(slot)),
  );
}

export async function disposeAllInstanceResources() {
  await Promise.all([...getRegistry().values()].map((map) => map.disposeAll()));
}

import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { applyPrivateFsMode } from "@/lib/runtime/local-state";

import { ENGINE_INSTALL_SOURCES, engineInstanceIdSchema } from "../../contract";
import { getRuntimePathsFilePath } from "../paths";

export { getRuntimePathsFilePath } from "../paths";

// Resolved runtime binaries, keyed by instance, in
// <state root>/engines/runtime-paths.json. New code persists discovered
// paths here instead of writing SENTINEL_<X>_PATH into desktop.env, whose
// key list (src/env.js) is frozen to the legacy engines.

const STATE_DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const runtimePathEntrySchema = z.object({
  binaryPath: z.string().min(1),
  realPath: z.string().min(1).nullable(),
  resolvedAt: z.string(),
  source: z.enum(ENGINE_INSTALL_SOURCES),
  version: z.string().nullable(),
});

const runtimePathsFileSchema = z.object({
  instances: z.record(z.string(), z.unknown()),
  version: z.literal(1),
});

export type RuntimePathEntry = z.infer<typeof runtimePathEntrySchema>;

export type RuntimePathsStore = {
  get(instanceId: string): Promise<RuntimePathEntry | null>;
  readAll(): Promise<Record<string, RuntimePathEntry>>;
  remove(instanceId: string): Promise<void>;
  set(
    instanceId: string,
    entry: Omit<RuntimePathEntry, "resolvedAt">,
  ): Promise<RuntimePathEntry>;
};

export function createRuntimePathsStore(options: {
  filePath: string | (() => string);
  now?: () => Date;
}): RuntimePathsStore {
  const now = options.now ?? (() => new Date());
  const getFilePath = () =>
    typeof options.filePath === "function"
      ? options.filePath()
      : options.filePath;
  // Serializes read-modify-write cycles within this process.
  let queue: Promise<unknown> = Promise.resolve();

  async function readAll(): Promise<Record<string, RuntimePathEntry>> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(getFilePath(), "utf8"));
    } catch {
      return {};
    }

    const parsed = runtimePathsFileSchema.safeParse(raw);
    if (!parsed.success) {
      return {};
    }

    const entries: Record<string, RuntimePathEntry> = {};
    for (const [instanceId, value] of Object.entries(parsed.data.instances)) {
      const entry = runtimePathEntrySchema.safeParse(value);
      if (
        engineInstanceIdSchema.safeParse(instanceId).success &&
        entry.success
      ) {
        entries[instanceId] = entry.data;
      }
    }
    return entries;
  }

  async function writeAll(entries: Record<string, RuntimePathEntry>) {
    const filePath = getFilePath();
    const directory = path.dirname(filePath);
    await mkdir(directory, { mode: STATE_DIRECTORY_MODE, recursive: true });
    await applyPrivateFsMode(directory, STATE_DIRECTORY_MODE);

    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ instances: entries, version: 1 }, null, 2)}\n`,
      { encoding: "utf8", mode: FILE_MODE },
    );
    await rename(temporaryPath, filePath);
    await applyPrivateFsMode(filePath, FILE_MODE);
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    async get(instanceId) {
      return (await readAll())[instanceId] ?? null;
    },
    readAll,
    remove(instanceId) {
      return enqueue(async () => {
        const entries = await readAll();
        if (!(instanceId in entries)) {
          return;
        }
        delete entries[instanceId];
        await writeAll(entries);
      });
    },
    async set(instanceId, entry) {
      engineInstanceIdSchema.parse(instanceId);
      return enqueue(async () => {
        const next = runtimePathEntrySchema.parse({
          ...entry,
          resolvedAt: now().toISOString(),
        });
        const entries = await readAll();
        entries[instanceId] = next;
        await writeAll(entries);
        return next;
      });
    },
  };
}

const globalForRuntimePaths = globalThis as unknown as {
  __sentinelRuntimePathsStore?: RuntimePathsStore;
};

/** The process-wide store under the current state root. */
export function getRuntimePathsStore() {
  globalForRuntimePaths.__sentinelRuntimePathsStore ??= createRuntimePathsStore(
    { filePath: () => getRuntimePathsFilePath() },
  );
  return globalForRuntimePaths.__sentinelRuntimePathsStore;
}

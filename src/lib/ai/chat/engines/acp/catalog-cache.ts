import "server-only";

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import type { AcpCatalogModel } from "./config-options";
import type { AcpCommandInfo } from "./schema";

// What an ACP instance learned while running, kept between probes in
// <state root>/engines/<instanceId>/catalog.json: the model list with each
// model's effort option (from the agent's config options or its model-list
// extension) and the slash commands it advertised. Probes read it (a cheap
// probe never talks to the agent); runs and full probes write it.

export type AcpCatalog = {
  commands: AcpCommandInfo[];
  learnedAt: string;
  models: AcpCatalogModel[];
};

const CATALOG_FILE = "catalog.json";
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export type CatalogFs = {
  mkdir?: typeof nodeMkdir;
  readFile?: typeof nodeReadFile;
  rename?: typeof nodeRename;
  writeFile?: typeof nodeWriteFile;
};

function isCatalog(value: unknown): value is AcpCatalog {
  const record = value as Partial<AcpCatalog> | null;
  return (
    !!record &&
    Array.isArray(record.models) &&
    Array.isArray(record.commands) &&
    typeof record.learnedAt === "string"
  );
}

export async function readAcpCatalog(
  stateDir: string,
  fs: CatalogFs = {},
): Promise<AcpCatalog | null> {
  try {
    const parsed: unknown = JSON.parse(
      await (fs.readFile ?? nodeReadFile)(
        path.join(stateDir, CATALOG_FILE),
        "utf8",
      ),
    );
    return isCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The learned list wins (the agent's current models, in its order); a
 * model keeps the effort option an earlier source knew when the new one
 * has none (a session only reports the current model's efforts), and the
 * default stays where an earlier source put it unless the learned list
 * names one (only a fresh session tells the agent's default).
 */
export function mergeCatalogModels(
  existing: readonly AcpCatalogModel[],
  learned: readonly AcpCatalogModel[],
): AcpCatalogModel[] {
  const previous = new Map(existing.map((model) => [model.id, model]));
  const learnedDefault = learned.some((model) => model.isDefault);
  return learned.map((model) => {
    const known = previous.get(model.id);
    const merged =
      model.effortOption || !known?.effortOption
        ? model
        : { ...model, effortOption: known.effortOption };
    return !learnedDefault && known?.isDefault && !merged.isDefault
      ? { ...merged, isDefault: true }
      : merged;
  });
}

const writes = new Map<string, Promise<unknown>>();

/** Merges `patch` into the stored catalog (writes per directory run one at a time). */
export async function updateAcpCatalog(
  stateDir: string,
  patch: { commands?: AcpCommandInfo[]; models?: AcpCatalogModel[] },
  options: CatalogFs & { now?: () => Date } = {},
): Promise<AcpCatalog> {
  const run = async () => {
    const current = await readAcpCatalog(stateDir, options);
    const next: AcpCatalog = {
      commands: patch.commands ?? current?.commands ?? [],
      learnedAt: (options.now?.() ?? new Date()).toISOString(),
      models: patch.models
        ? mergeCatalogModels(current?.models ?? [], patch.models)
        : (current?.models ?? []),
    };
    const target = path.join(stateDir, CATALOG_FILE);
    const temporary = `${target}.${process.pid}.tmp`;
    await (options.mkdir ?? nodeMkdir)(stateDir, {
      mode: DIRECTORY_MODE,
      recursive: true,
    });
    await (options.writeFile ?? nodeWriteFile)(
      temporary,
      JSON.stringify(next, null, 2),
      { encoding: "utf8", mode: FILE_MODE },
    );
    await (options.rename ?? nodeRename)(temporary, target);
    return next;
  };

  const previous = writes.get(stateDir) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(run);
  writes.set(stateDir, pending);
  try {
    return await pending;
  } finally {
    if (writes.get(stateDir) === pending) {
      writes.delete(stateDir);
    }
  }
}

import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SKILL_FILENAME = "SKILL.md";
const WATCH_DEBOUNCE_MS = 150;
const FILE_SAMPLE_LIMIT = 24;
const GLOBAL_WORKSPACE_KEY = "__global__";
const CODEX_SOURCE_KIND = "codex" as const;

const SOURCE_PRECEDENCE = [
  { container: ".sentinel/skills", scope: "workspace", sourceKind: "sentinel" },
  { container: ".agents/skills", scope: "workspace", sourceKind: "agents" },
  { container: ".claude/skills", scope: "workspace", sourceKind: "claude" },
  { container: ".sentinel/skills", scope: "global", sourceKind: "sentinel" },
  { container: ".agents/skills", scope: "global", sourceKind: "agents" },
  { container: ".claude/skills", scope: "global", sourceKind: "claude" },
] as const;

export type SkillScope = (typeof SOURCE_PRECEDENCE)[number]["scope"];
export type SkillSourceKind =
  | (typeof SOURCE_PRECEDENCE)[number]["sourceKind"]
  | typeof CODEX_SOURCE_KIND;

export type SkillMetadata = {
  description: string;
  directory: string;
  name: string;
  preview: string;
  scope: SkillScope;
  skillFile: string;
  sourceKind: SkillSourceKind;
};

export type LoadedSkill = SkillMetadata & {
  content: string;
  files: string[];
};

type DiscoveredSkill = LoadedSkill & {
  normalizedName: string;
  realSkillFile: string;
  shadowedByName: string | null;
};

export type SkillSnapshot = {
  revision: number;
  skillRoots: string[];
  skills: SkillMetadata[];
  updatedAt: number;
};

type SkillLookupTarget = "sentinel" | "codex" | "claude";

type ConventionalSkillRoot = {
  containerDirectory: string;
  precedence: number;
  scope: SkillScope;
  sourceKind: (typeof SOURCE_PRECEDENCE)[number]["sourceKind"];
};

type SkillRegistryEntry = {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  fingerprint: string | null;
  globalBase: string | null;
  key: string;
  refreshPromise: Promise<SkillSnapshot> | null;
  snapshot: SkillSnapshot | null;
  watchers: Map<string, FSWatcher>;
  workspaceRoot: string | null;
};

const skillRegistry = new Map<string, SkillRegistryEntry>();

function normalizeSkillName(name: string) {
  return name.trim().toLowerCase();
}

function stripOuterQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseSkillFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match?.[1]) {
    throw new Error("Missing YAML frontmatter.");
  }

  let name: string | null = null;
  let description: string | null = null;

  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine || /^\s/.test(rawLine)) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    const rawValue = rawLine.slice(separatorIndex + 1).trim();
    const value = stripOuterQuotes(rawValue);

    if (key === "name" && value) {
      name = value;
      continue;
    }

    if (key === "description" && value) {
      description = value;
    }
  }

  if (!name || !description) {
    throw new Error("Frontmatter must include non-empty name and description.");
  }

  return {
    description,
    frontmatter: match[0],
    name,
  };
}

function stripSkillFrontmatter(content: string) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

function toRegistryKey(workspaceRoot: string | null | undefined) {
  return workspaceRoot ? path.resolve(workspaceRoot) : GLOBAL_WORKSPACE_KEY;
}

async function pathExists(candidatePath: string) {
  return Boolean(await stat(candidatePath).catch(() => null));
}

async function safeRealpath(candidatePath: string) {
  return await realpath(candidatePath).catch(() => path.resolve(candidatePath));
}

function buildConventionalRoots(
  workspaceRoot: string | null,
  globalBase?: string | null,
) {
  const homeDirectory =
    globalBase?.trim() || process.env.HOME?.trim() || os.homedir();

  return SOURCE_PRECEDENCE.map((entry, index) => {
    const baseDirectory =
      entry.scope === "workspace" ? workspaceRoot : homeDirectory;

    if (!baseDirectory) {
      return null;
    }

    return {
      containerDirectory: path.join(baseDirectory, entry.container),
      precedence: index,
      scope: entry.scope,
      sourceKind: entry.sourceKind,
    } satisfies ConventionalSkillRoot;
  }).filter((entry): entry is ConventionalSkillRoot => Boolean(entry));
}

async function listSampleFiles(skillDirectory: string) {
  const files: string[] = [];

  const walk = async (currentDirectory: string, relativeDirectory: string) => {
    if (files.length >= FILE_SAMPLE_LIMIT) {
      return;
    }

    const entries = await readdir(currentDirectory, {
      withFileTypes: true,
    }).catch(() => []);

    entries.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    for (const entry of entries) {
      if (files.length >= FILE_SAMPLE_LIMIT) {
        return;
      }

      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await walk(path.join(currentDirectory, entry.name), relativePath);
        continue;
      }

      if (relativePath === SKILL_FILENAME) {
        continue;
      }

      files.push(relativePath);
    }
  };

  await walk(skillDirectory, "");
  return files;
}

async function loadSkillFromDirectory({
  directory,
  scope,
  sourceKind,
}: {
  directory: string;
  scope: SkillScope;
  sourceKind: SkillSourceKind;
}) {
  const skillFile = path.join(directory, SKILL_FILENAME);
  const content = await readFile(skillFile, "utf8").catch(() => null);

  if (!content) {
    return null;
  }

  const parsed = parseSkillFrontmatter(content);

  return {
    content: stripSkillFrontmatter(content),
    description: parsed.description,
    directory,
    files: await listSampleFiles(directory),
    name: parsed.name,
    preview: stripSkillFrontmatter(content).slice(0, 400),
    scope,
    skillFile,
    sourceKind,
  } satisfies LoadedSkill;
}

async function discoverSkillsInRoot(root: ConventionalSkillRoot) {
  const discovered: DiscoveredSkill[] = [];
  const skillEntries = await readdir(root.containerDirectory, {
    withFileTypes: true,
  }).catch(() => []);

  skillEntries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directory = path.join(root.containerDirectory, entry.name);
    const skillFile = path.join(directory, SKILL_FILENAME);
    const content = await readFile(skillFile, "utf8").catch(() => null);

    if (!content) {
      continue;
    }

    let parsed: ReturnType<typeof parseSkillFrontmatter>;
    try {
      parsed = parseSkillFrontmatter(content);
    } catch {
      continue;
    }

    discovered.push({
      content: stripSkillFrontmatter(content),
      description: parsed.description,
      directory,
      files: await listSampleFiles(directory),
      name: parsed.name,
      normalizedName: normalizeSkillName(parsed.name),
      preview: stripSkillFrontmatter(content).slice(0, 400),
      realSkillFile: await safeRealpath(skillFile),
      scope: root.scope,
      shadowedByName: null,
      skillFile,
      sourceKind: root.sourceKind,
    });
  }

  return discovered;
}

function createFingerprint(skills: DiscoveredSkill[]) {
  return JSON.stringify(
    skills.map((skill) => ({
      content: skill.content,
      description: skill.description,
      directory: skill.directory,
      name: skill.name,
      scope: skill.scope,
      skillFile: skill.skillFile,
      sourceKind: skill.sourceKind,
    })),
  );
}

function toSkillSnapshot(
  effectiveSkills: DiscoveredSkill[],
  previousSnapshot: SkillSnapshot | null,
  previousFingerprint: string | null,
) {
  const skills = effectiveSkills.map<SkillMetadata>((skill) => ({
    description: skill.description,
    directory: skill.directory,
    name: skill.name,
    preview: skill.content.slice(0, 400),
    scope: skill.scope,
    skillFile: skill.skillFile,
    sourceKind: skill.sourceKind,
  }));
  const fingerprint = createFingerprint(effectiveSkills);
  const revision =
    previousSnapshot && previousFingerprint === fingerprint
      ? previousSnapshot.revision
      : (previousSnapshot?.revision ?? 0) + 1;

  return {
    fingerprint,
    snapshot: {
      revision,
      skillRoots: effectiveSkills.map((skill) => skill.directory),
      skills,
      updatedAt: Date.now(),
    } satisfies SkillSnapshot,
  };
}

async function discoverSkillState(
  workspaceRoot: string | null,
  globalBase?: string | null,
) {
  const roots = buildConventionalRoots(workspaceRoot, globalBase);
  const allDiscovered: DiscoveredSkill[] = [];
  const seenRealFiles = new Set<string>();

  for (const root of roots) {
    const discoveredInRoot = await discoverSkillsInRoot(root);

    for (const skill of discoveredInRoot) {
      if (seenRealFiles.has(skill.realSkillFile)) {
        continue;
      }

      seenRealFiles.add(skill.realSkillFile);
      allDiscovered.push(skill);
    }
  }

  const winners = new Map<string, DiscoveredSkill>();

  for (const skill of allDiscovered) {
    const existing = winners.get(skill.normalizedName);

    if (!existing) {
      winners.set(skill.normalizedName, skill);
      continue;
    }

    skill.shadowedByName = existing.name;
  }

  const effectiveSkills = Array.from(winners.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return {
    effectiveSkills,
    roots,
  };
}

async function nearestExistingDirectory(candidatePath: string) {
  let current = path.resolve(candidatePath);

  while (true) {
    const currentStats = await stat(current).catch(() => null);

    if (currentStats?.isDirectory()) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

async function buildWatchTargets(
  workspaceRoot: string | null,
  globalBase?: string | null,
) {
  const { effectiveSkills, roots } = await discoverSkillState(
    workspaceRoot,
    globalBase,
  );
  const targets = new Map<string, string>();

  for (const root of roots) {
    const target = (await pathExists(root.containerDirectory))
      ? root.containerDirectory
      : await nearestExistingDirectory(path.dirname(root.containerDirectory));

    if (!target) {
      continue;
    }

    targets.set(await safeRealpath(target), target);
  }

  for (const skill of effectiveSkills) {
    targets.set(await safeRealpath(skill.directory), skill.directory);
  }

  return {
    effectiveSkills,
    targets: Array.from(targets.values()),
  };
}

async function refreshEntry(entry: SkillRegistryEntry) {
  if (entry.refreshPromise) {
    return await entry.refreshPromise;
  }

  entry.refreshPromise = (async () => {
    const { effectiveSkills } = await discoverSkillState(
      entry.workspaceRoot,
      entry.globalBase,
    );
    const { fingerprint, snapshot } = toSkillSnapshot(
      effectiveSkills,
      entry.snapshot,
      entry.fingerprint,
    );

    entry.snapshot = snapshot;
    entry.fingerprint = fingerprint;
    return snapshot;
  })().finally(() => {
    entry.refreshPromise = null;
  });

  return await entry.refreshPromise;
}

function closeWatchers(entry: SkillRegistryEntry) {
  for (const watcher of entry.watchers.values()) {
    watcher.close();
  }
  entry.watchers.clear();
}

async function syncWatchers(entry: SkillRegistryEntry) {
  const { targets } = await buildWatchTargets(
    entry.workspaceRoot,
    entry.globalBase,
  );
  const nextTargets = new Map<string, string>();

  for (const target of targets) {
    nextTargets.set(await safeRealpath(target), target);
  }

  for (const [key, watcher] of entry.watchers.entries()) {
    if (nextTargets.has(key)) {
      continue;
    }

    watcher.close();
    entry.watchers.delete(key);
  }

  for (const [key, target] of nextTargets.entries()) {
    if (entry.watchers.has(key)) {
      continue;
    }

    const watcher = watch(target, { persistent: false }, () => {
      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer);
      }

      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null;
        void refreshWatchedEntry(entry);
      }, WATCH_DEBOUNCE_MS);
    });

    watcher.on("error", () => {
      watcher.close();
      entry.watchers.delete(key);
    });

    entry.watchers.set(key, watcher);
  }
}

async function refreshWatchedEntry(entry: SkillRegistryEntry) {
  const startingRevision = entry.snapshot?.revision ?? 0;

  await syncWatchers(entry);
  const snapshot = await refreshEntry(entry);
  await syncWatchers(entry);

  if (snapshot.revision > startingRevision) {
    return;
  }

  // Parent directory notifications can arrive before a nested SKILL.md write
  // lands, especially on Linux CI when a new skills container is created
  // recursively. A short second pass keeps the watcher behavior deterministic.
  await new Promise((resolve) => setTimeout(resolve, WATCH_DEBOUNCE_MS));
  await syncWatchers(entry);
  await refreshEntry(entry);
  await syncWatchers(entry);
}

function getOrCreateEntry(
  workspaceRoot: string | null,
  globalBase?: string | null,
) {
  const key = toRegistryKey(workspaceRoot);
  const existing = skillRegistry.get(key);

  if (existing) {
    if (globalBase !== undefined) {
      existing.globalBase = globalBase || null;
    }
    return existing;
  }

  const entry: SkillRegistryEntry = {
    debounceTimer: null,
    fingerprint: null,
    globalBase: globalBase || null,
    key,
    refreshPromise: null,
    snapshot: null,
    watchers: new Map(),
    workspaceRoot: workspaceRoot ? path.resolve(workspaceRoot) : null,
  };

  skillRegistry.set(key, entry);
  return entry;
}

export async function discoverSkills({
  workspaceRoot,
  globalBase,
}: {
  workspaceRoot: string | null;
  globalBase?: string | null;
}) {
  const { effectiveSkills } = await discoverSkillState(
    workspaceRoot ? path.resolve(workspaceRoot) : null,
    globalBase,
  );

  return effectiveSkills.map<SkillMetadata>((skill) => ({
    description: skill.description,
    directory: skill.directory,
    name: skill.name,
    preview: skill.content.slice(0, 400),
    scope: skill.scope,
    skillFile: skill.skillFile,
    sourceKind: skill.sourceKind,
  }));
}

export async function discoverCodexSkills({
  globalBase,
}: {
  globalBase?: string | null;
}) {
  const codexHome = globalBase?.trim() || path.join(os.homedir(), ".codex");
  const skillsDirectory = path.join(codexHome, "skills");
  const entries = await readdir(skillsDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  const skills: SkillMetadata[] = [];

  entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const loaded = await loadSkillFromDirectory({
      directory: path.join(skillsDirectory, entry.name),
      scope: "global",
      sourceKind: CODEX_SOURCE_KIND,
    }).catch(() => null);

    if (!loaded) {
      continue;
    }

    skills.push({
      description: loaded.description,
      directory: loaded.directory,
      name: loaded.name,
      preview: loaded.preview,
      scope: loaded.scope,
      skillFile: loaded.skillFile,
      sourceKind: loaded.sourceKind,
    });
  }

  return skills;
}

export async function watchSkillRoots({
  workspaceRoot,
  globalBase,
}: {
  workspaceRoot: string | null;
  globalBase?: string | null;
}) {
  const entry = getOrCreateEntry(
    workspaceRoot ? path.resolve(workspaceRoot) : null,
    globalBase,
  );
  await refreshEntry(entry);
  await syncWatchers(entry);
  return entry.snapshot;
}

export async function getSkillSnapshot({
  workspaceRoot,
  globalBase,
}: {
  workspaceRoot: string | null;
  globalBase?: string | null;
}) {
  const entry = getOrCreateEntry(
    workspaceRoot ? path.resolve(workspaceRoot) : null,
    globalBase,
  );
  await watchSkillRoots({
    workspaceRoot: entry.workspaceRoot,
    globalBase: entry.globalBase,
  });

  if (!entry.snapshot) {
    throw new Error("Skill snapshot is unavailable.");
  }

  return entry.snapshot;
}

export async function loadSkillByName({
  name,
  workspaceRoot,
  globalBase,
  target = "sentinel",
}: {
  name: string;
  workspaceRoot: string | null;
  globalBase?: string | null;
  target?: SkillLookupTarget;
}) {
  if (target === "codex") {
    return await loadSkillFromDirectory({
      directory: path.join(
        globalBase?.trim() || path.join(os.homedir(), ".codex"),
        "skills",
        name,
      ),
      scope: "global",
      sourceKind: CODEX_SOURCE_KIND,
    }).catch(() => null);
  }

  const normalizedName = normalizeSkillName(name);
  const roots = buildConventionalRoots(
    workspaceRoot ? path.resolve(workspaceRoot) : null,
    globalBase,
  );
  const allowedSourceKinds =
    target === "claude"
      ? new Set<SkillSourceKind>(["claude"])
      : new Set<SkillSourceKind>(["sentinel", "agents"]);
  const seenRealFiles = new Set<string>();

  for (const root of roots) {
    if (!allowedSourceKinds.has(root.sourceKind)) {
      continue;
    }

    const discoveredInRoot = await discoverSkillsInRoot(root);

    for (const skill of discoveredInRoot) {
      if (seenRealFiles.has(skill.realSkillFile)) {
        continue;
      }

      seenRealFiles.add(skill.realSkillFile);

      if (skill.normalizedName === normalizedName) {
        return {
          content: skill.content,
          description: skill.description,
          directory: skill.directory,
          files: skill.files,
          name: skill.name,
          preview: skill.content.slice(0, 400),
          scope: skill.scope,
          skillFile: skill.skillFile,
          sourceKind: skill.sourceKind,
        } satisfies LoadedSkill;
      }
    }
  }

  return null;
}

export const __internal = {
  clearSkillRegistry() {
    for (const entry of skillRegistry.values()) {
      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer);
      }
      closeWatchers(entry);
    }
    skillRegistry.clear();
  },
  GLOBAL_WORKSPACE_KEY,
  loadSkillFromDirectory,
  normalizeSkillName,
  parseSkillFrontmatter,
  stripSkillFrontmatter,
  WATCH_DEBOUNCE_MS,
};

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");
const ALLOWED_ASAR_TOP_LEVEL = new Set(["desktop", "package.json", "scripts"]);
const UNPACKED_DENYLIST = [
  "/node_modules/@img/sharp-",
  "/node_modules/@next/swc",
  "/node_modules/better-sqlite3/",
  "/node_modules/sharp/",
];

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findArtifacts(rootPath) {
  const apps = [];
  const dmgs = [];

  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.endsWith(".app")) {
          apps.push(fullPath);
          continue;
        }

        await visit(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".dmg")) {
        dmgs.push(fullPath);
      }
    }
  }

  await visit(rootPath);

  return {
    apps: apps.sort(),
    dmgs: dmgs.sort(),
  };
}

function getSizeBytes(targetPath) {
  const output = execFileSync("du", ["-sk", targetPath], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const kilobytes = Number.parseInt(output.trim().split(/\s+/)[0] ?? "0", 10);
  return kilobytes * 1024;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function collectFiles(rootPath) {
  const files = [];

  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(rootPath);
  return files.sort();
}

function getAsarTopLevelEntries(paths) {
  const entries = new Set();

  for (const filePath of paths) {
    const relativePath = filePath.replace(/^\/+/, "");
    const [topLevel] = relativePath.split("/");
    if (topLevel) {
      entries.add(topLevel);
    }
  }

  return [...entries].sort();
}

const { apps, dmgs } = await findArtifacts(distRoot);
const appPath = apps[0];
const dmgPath = dmgs[0];

if (!appPath) {
  throw new Error("No packaged .app was found under dist/.");
}

if (!dmgPath) {
  throw new Error("No packaged .dmg was found under dist/.");
}

const resourcesPath = path.join(appPath, "Contents", "Resources");
const appAsarPath = path.join(resourcesPath, "app.asar");
const appAsarUnpackedPath = path.join(resourcesPath, "app.asar.unpacked");
const serverPath = path.join(resourcesPath, "server");

const appAsarEntries = listPackage(appAsarPath);
const asarTopLevelEntries = getAsarTopLevelEntries(appAsarEntries);
const unexpectedAsarEntries = asarTopLevelEntries.filter(
  (entry) => !ALLOWED_ASAR_TOP_LEVEL.has(entry),
);

const unpackedFiles = (await pathExists(appAsarUnpackedPath))
  ? await collectFiles(appAsarUnpackedPath)
  : [];
const denylistedUnpackedFiles = unpackedFiles.filter((filePath) =>
  UNPACKED_DENYLIST.some((pattern) => filePath.includes(pattern)),
);

const reportRows = [
  ["app.asar", appAsarPath],
  ["app.asar.unpacked", appAsarUnpackedPath],
  ["server", serverPath],
  ["app", appPath],
  ["dmg", dmgPath],
];

console.log("[desktop] bundle size audit");
for (const [label, targetPath] of reportRows) {
  const exists = await pathExists(targetPath);
  const formattedSize = exists
    ? formatBytes(getSizeBytes(targetPath))
    : "missing";
  console.log(`  ${label.padEnd(18)} ${formattedSize}`);
}
console.log(
  `  ${"app.asar top-level".padEnd(18)} ${asarTopLevelEntries.join(", ") || "(empty)"}`,
);

const failures = [];

if (unexpectedAsarEntries.length > 0) {
  failures.push(
    `Unexpected top-level entries in app.asar: ${unexpectedAsarEntries.join(", ")}`,
  );
}

if (denylistedUnpackedFiles.length > 0) {
  failures.push(
    `Unexpected shell-native payload in app.asar.unpacked:\n${denylistedUnpackedFiles.join("\n")}`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[desktop] ${failure}`);
  }
  process.exit(1);
}

console.log("[desktop] bundle audit passed.");

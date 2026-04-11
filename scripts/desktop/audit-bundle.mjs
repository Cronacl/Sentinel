import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { findMissingServerRuntimeFiles } from "./audit-bundle-utils.mjs";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");
const {
  getExpectedPackagedCopilotFiles,
} = require("./copilot-runtime-packaging.cjs");

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");
const ALLOWED_ASAR_TOP_LEVEL = new Set(["desktop", "package.json", "scripts"]);
const UNPACKED_DENYLIST = [
  "/node_modules/@img/sharp-",
  "/node_modules/@next/swc",
  "/node_modules/better-sqlite3/",
  "/node_modules/sharp/",
];

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function inferPlatform() {
  switch (process.platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    default:
      return "linux";
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findArtifacts(rootPath) {
  const directories = [];
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
        directories.push(fullPath);
        await visit(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(rootPath);

  return {
    directories: directories.sort(),
    files: files.sort(),
  };
}

async function getSizeBytes(targetPath) {
  const targetStats = await stat(targetPath);
  if (!targetStats.isDirectory()) {
    return targetStats.size;
  }

  let totalSize = 0;
  const entries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    totalSize += await getSizeBytes(path.join(targetPath, entry.name));
  }

  return totalSize;
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

function normalizePathForMatch(filePath) {
  return filePath.replaceAll("\\", "/");
}

function getAsarTopLevelEntries(paths) {
  const entries = new Set();

  for (const filePath of paths) {
    const relativePath = normalizePathForMatch(filePath).replace(/^\/+/, "");
    const [topLevel] = relativePath.split("/");
    if (topLevel) {
      entries.add(topLevel);
    }
  }

  return [...entries].sort();
}

function findInstallerFiles(files, extension) {
  return files.filter(
    (filePath) =>
      path.dirname(filePath) === distRoot && filePath.endsWith(extension),
  );
}

function findUnpackedApps(directories, platform) {
  const hasUnpackedSuffix = (directoryPath) =>
    path.basename(directoryPath).endsWith("-unpacked");

  switch (platform) {
    case "mac":
      return directories.filter(
        (directoryPath) =>
          directoryPath.endsWith(".app") &&
          path.basename(path.dirname(directoryPath)).startsWith("mac") &&
          path.dirname(path.dirname(directoryPath)) === distRoot,
      );
    case "win":
      return directories.filter(
        (directoryPath) =>
          path.basename(directoryPath).startsWith("win") &&
          hasUnpackedSuffix(directoryPath),
      );
    case "linux":
      return directories.filter(
        (directoryPath) =>
          path.basename(directoryPath).startsWith("linux") &&
          hasUnpackedSuffix(directoryPath),
      );
    default:
      throw new Error(`Unsupported audit platform: ${platform}`);
  }
}

const platform = getArgValue("--platform") ?? inferPlatform();
const { directories, files } = await findArtifacts(distRoot);
const unpackedAppPaths = findUnpackedApps(directories, platform);

if (unpackedAppPaths.length === 0) {
  throw new Error(
    `No unpacked app bundle was found for platform "${platform}".`,
  );
}

const installerPaths =
  platform === "mac"
    ? findInstallerFiles(files, ".dmg")
    : platform === "win"
      ? findInstallerFiles(files, ".exe")
      : [
          ...findInstallerFiles(files, ".AppImage"),
          ...findInstallerFiles(files, ".deb"),
          ...findInstallerFiles(files, ".rpm"),
        ];

if (installerPaths.length === 0) {
  throw new Error(
    `No installer artifact was found for platform "${platform}".`,
  );
}

const requiresSpawnHelper = platform === "mac";
const failures = [];

console.log("[desktop] bundle size audit");

for (const unpackedAppPath of unpackedAppPaths) {
  const resourcesPath =
    platform === "mac"
      ? path.join(unpackedAppPath, "Contents", "Resources")
      : path.join(unpackedAppPath, "resources");
  const appAsarPath = path.join(resourcesPath, "app.asar");
  const appAsarUnpackedPath = path.join(resourcesPath, "app.asar.unpacked");
  const shellNodePtyPath = path.join(resourcesPath, "node_modules", "node-pty");
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
    UNPACKED_DENYLIST.some((pattern) =>
      normalizePathForMatch(filePath).includes(pattern),
    ),
  );
  const shellNodePtyFiles = (await pathExists(shellNodePtyPath))
    ? await collectFiles(shellNodePtyPath)
    : [];
  const serverFiles = (await pathExists(serverPath))
    ? await collectFiles(serverPath)
    : [];
  const hasShellNodePtyEntrypoint = shellNodePtyFiles.some((filePath) =>
    normalizePathForMatch(filePath).endsWith("/lib/index.js"),
  );
  const hasShellNodePtyBinary = shellNodePtyFiles.some((filePath) =>
    normalizePathForMatch(filePath).endsWith("/pty.node"),
  );
  const hasShellNodePtySpawnHelper =
    !requiresSpawnHelper ||
    shellNodePtyFiles.some((filePath) =>
      normalizePathForMatch(filePath).endsWith("/spawn-helper"),
    );

  const reportRows = [
    ["app.asar", appAsarPath],
    ["app.asar.unpacked", appAsarUnpackedPath],
    ["shell node-pty", shellNodePtyPath],
    ["server", serverPath],
    ["unpacked app", unpackedAppPath],
  ];

  console.log(
    `  bundle             ${path.basename(path.dirname(unpackedAppPath))}`,
  );
  for (const [label, targetPath] of reportRows) {
    const exists = await pathExists(targetPath);
    const formattedSize = exists
      ? formatBytes(await getSizeBytes(targetPath))
      : "missing";
    console.log(`  ${label.padEnd(18)} ${formattedSize}`);
  }
  console.log(
    `  ${"app.asar top-level".padEnd(18)} ${asarTopLevelEntries.join(", ") || "(empty)"}`,
  );

  if (unexpectedAsarEntries.length > 0) {
    failures.push(
      `${unpackedAppPath}: unexpected top-level entries in app.asar: ${unexpectedAsarEntries.join(", ")}`,
    );
  }

  if (denylistedUnpackedFiles.length > 0) {
    failures.push(
      `${unpackedAppPath}: unexpected shell-native payload in app.asar.unpacked:\n${denylistedUnpackedFiles.join("\n")}`,
    );
  }

  if (!hasShellNodePtyEntrypoint) {
    failures.push(
      `${unpackedAppPath}: desktop shell dependency is missing node-pty/lib/index.js at ${shellNodePtyPath}.`,
    );
  }

  if (!hasShellNodePtyBinary) {
    failures.push(
      `${unpackedAppPath}: desktop shell dependency is missing a packaged node-pty native binary at ${shellNodePtyPath}.`,
    );
  }

  if (!hasShellNodePtySpawnHelper) {
    failures.push(
      `${unpackedAppPath}: desktop shell dependency is missing spawn-helper at ${shellNodePtyPath}.`,
    );
  }

  const missingCopilotRuntimeFiles = findMissingServerRuntimeFiles({
    requiredFiles: getExpectedPackagedCopilotFiles({
      serverNodeModulesPath: path.join(serverPath, "node_modules"),
    }),
    serverFiles,
    serverPath,
  });

  if (missingCopilotRuntimeFiles.length > 0) {
    failures.push(
      `${unpackedAppPath}: packaged server is missing Copilot runtime files:\n${missingCopilotRuntimeFiles.join("\n")}`,
    );
  }
}

for (const installerPath of installerPaths) {
  const installerLabel =
    installerPaths.length === 1
      ? "installer"
      : `installer (${path.basename(installerPath)})`;
  console.log(
    `  ${installerLabel.padEnd(18)} ${formatBytes(await getSizeBytes(installerPath))}`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[desktop] ${failure}`);
  }
  process.exit(1);
}

console.log("[desktop] bundle audit passed.");

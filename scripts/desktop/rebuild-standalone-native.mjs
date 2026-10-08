import { existsSync, readFileSync } from "node:fs";
import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { getElectronExecutablePath } from "./electron-binary.mjs";

const projectRoot = process.cwd();
const targetRoot = path.join(projectRoot, "desktop", "dist", "server");
const targetPackagePath = path.join(targetRoot, "package.json");
// better-sqlite3 13+ is an N-API addon that bundles a prebuilt binary for every
// supported target, so the packaged copy keeps the target's prebuild and drops
// the sources instead of being rebuilt against Electron's headers.
const BETTER_SQLITE3_BUILD_ENTRIES = ["binding.gyp", "build", "deps", "src"];

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function normalizeTargetPlatform(platform) {
  switch (platform) {
    case "darwin":
    case "linux":
    case "win32":
      return platform;
    case "mac":
      return "darwin";
    case "win":
      return "win32";
    default:
      return null;
  }
}

const electronBin = getElectronExecutablePath(projectRoot);
const targetPlatform =
  normalizeTargetPlatform(getArgValue("--platform") ?? process.platform) ??
  process.platform;
const targetArch = getArgValue("--arch") ?? process.arch;
const isHostTarget =
  targetPlatform === process.platform && targetArch === process.arch;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
    child.on("error", reject);
  });
}

async function runWithEnv(command, args, options = {}) {
  const { env: envOverrides = {}, ...spawnOptions } = options;

  if (process.platform !== "win32") {
    await run(command, args, {
      ...spawnOptions,
      env: {
        ...process.env,
        ...envOverrides,
      },
    });
    return;
  }

  const previousEnv = new Map();

  for (const [key, value] of Object.entries(envOverrides)) {
    previousEnv.set(key, process.env[key]);

    if (value == null) {
      delete process.env[key];
      continue;
    }

    process.env[key] = String(value);
  }

  try {
    await run(command, args, spawnOptions);
  } finally {
    for (const [key, value] of previousEnv.entries()) {
      if (value == null) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }
}

function getInstalledVersion(packageName) {
  const packageJsonPath = path.join(
    projectRoot,
    "node_modules",
    packageName,
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

async function syncModuleDirectory(packageName) {
  const sourcePath = path.join(projectRoot, "node_modules", packageName);
  const targetPath = path.join(targetRoot, "node_modules", packageName);

  if (!existsSync(sourcePath)) {
    throw new Error(`Expected ${packageName} at ${sourcePath}.`);
  }

  await rm(targetPath, { force: true, recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
}

// sqlite-vec 0.1.9 finds its loadable extension through a dynamic
// require.resolve that Next's output tracing cannot follow, so the target's
// platform package is copied into the packaged server explicitly.
function getSqliteVecPlatformPackage() {
  const os = targetPlatform === "win32" ? "windows" : targetPlatform;
  return `sqlite-vec-${os}-${targetArch}`;
}

async function syncSqliteVecPlatformPackage() {
  const packageName = getSqliteVecPlatformPackage();

  if (existsSync(path.join(projectRoot, "node_modules", packageName))) {
    await syncModuleDirectory(packageName);
    return true;
  }

  const message = `${packageName} is not installed, so the packaged server cannot load sqlite-vec for ${targetPlatform}-${targetArch}.`;
  if (isHostTarget) {
    throw new Error(`[desktop] ${message}`);
  }

  console.warn(`[desktop] ${message}`);
  return false;
}

async function pruneBetterSqlite3Runtime() {
  const moduleRoot = path.join(targetRoot, "node_modules", "better-sqlite3");
  const prebuildsPath = path.join(moduleRoot, "prebuilds");
  const targetPrebuild = `${targetPlatform}-${targetArch}.node`;

  if (!existsSync(path.join(prebuildsPath, targetPrebuild))) {
    throw new Error(
      `better-sqlite3 ${getInstalledVersion("better-sqlite3")} ships no prebuilt binary for ${targetPlatform}-${targetArch} (expected prebuilds/${targetPrebuild}).`,
    );
  }

  for (const entry of BETTER_SQLITE3_BUILD_ENTRIES) {
    await rm(path.join(moduleRoot, entry), { force: true, recursive: true });
  }

  for (const entry of await readdir(prebuildsPath)) {
    if (entry !== targetPrebuild) {
      await rm(path.join(prebuildsPath, entry), {
        force: true,
        recursive: true,
      });
    }
  }
}

const rootPackageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

const runtimeDependencies = ["better-sqlite3", "sqlite-vec"].reduce(
  (accumulator, packageName) => {
    const installedPath = path.join(targetRoot, "node_modules", packageName);

    if (!existsSync(installedPath)) {
      return accumulator;
    }

    accumulator[packageName] = getInstalledVersion(packageName);
    return accumulator;
  },
  {},
);

if (Object.keys(runtimeDependencies).length === 0) {
  console.warn(
    "[desktop] no standalone native dependencies were found to package.",
  );
  process.exit(0);
}

await syncModuleDirectory("better-sqlite3");
const hasSqliteVec =
  Boolean(runtimeDependencies["sqlite-vec"]) &&
  (await syncSqliteVecPlatformPackage());

const runtimePackageJson = {
  name: `${rootPackageJson.name}-desktop-runtime`,
  private: true,
  version: rootPackageJson.version,
  packageManager: rootPackageJson.packageManager,
  type: rootPackageJson.type ?? "module",
  dependencies: runtimeDependencies,
};

await writeFile(
  targetPackagePath,
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
);

await pruneBetterSqlite3Runtime();

if (isHostTarget) {
  await runWithEnv(
    electronBin,
    [
      "-e",
      [
        "const Database=require('better-sqlite3');",
        "const db=new Database(':memory:');",
        "console.log('better-sqlite3 select 1 =', db.prepare('select 1 as value').get().value);",
        ...(hasSqliteVec
          ? [
              "require('sqlite-vec').load(db);",
              "console.log('sqlite-vec', db.prepare('select vec_version() as version').get().version);",
            ]
          : []),
        "db.close();",
      ].join(" "),
    ],
    {
      cwd: targetRoot,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
      },
    },
  );
} else {
  console.log(
    `[desktop] skipping better-sqlite3 and sqlite-vec runtime verification for cross-target ${targetPlatform}-${targetArch}`,
  );
}

import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const targetRoot = path.join(projectRoot, "desktop", "dist", "server");
const targetPackagePath = path.join(targetRoot, "package.json");
const electronGypDir = path.join(projectRoot, ".electron-gyp");

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

function normalizeTargetArch(arch) {
  if (arch === "arm") {
    return "armv7l";
  }

  return arch;
}

function getElectronExecutablePath() {
  switch (process.platform) {
    case "darwin":
      return path.join(
        projectRoot,
        "node_modules",
        "electron",
        "dist",
        "Electron.app",
        "Contents",
        "MacOS",
        "Electron",
      );
    case "win32":
      return path.join(
        projectRoot,
        "node_modules",
        "electron",
        "dist",
        "electron.exe",
      );
    default:
      return path.join(
        projectRoot,
        "node_modules",
        "electron",
        "dist",
        "electron",
      );
  }
}

function getNpmInvocation() {
  if (process.platform !== "win32") {
    return {
      argsPrefix: [],
      command: "npm",
    };
  }

  const bundledNpmCliPath = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );

  if (!existsSync(bundledNpmCliPath)) {
    return {
      argsPrefix: [],
      command: "npm.cmd",
    };
  }

  return {
    argsPrefix: [bundledNpmCliPath],
    command: process.execPath,
  };
}

const electronBin = getElectronExecutablePath();
const npmInvocation = getNpmInvocation();
const hostArch = normalizeTargetArch(process.arch);
const targetPlatform =
  normalizeTargetPlatform(getArgValue("--platform") ?? process.platform) ??
  process.platform;
const targetArch = normalizeTargetArch(getArgValue("--arch") ?? hostArch);
const isHostTarget =
  targetPlatform === process.platform && targetArch === hostArch;

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

async function pruneBetterSqlite3Runtime() {
  const moduleRoot = path.join(targetRoot, "node_modules", "better-sqlite3");
  const compiledBinaryPath = path.join(
    moduleRoot,
    "build",
    "Release",
    "better_sqlite3.node",
  );
  const stagedBinaryPath = path.join(targetRoot, "better_sqlite3.node");

  if (!existsSync(compiledBinaryPath)) {
    throw new Error(
      `Expected rebuilt better-sqlite3 binary at ${compiledBinaryPath}.`,
    );
  }

  await cp(compiledBinaryPath, stagedBinaryPath);
  await rm(path.join(moduleRoot, "build"), { force: true, recursive: true });
  await rm(path.join(moduleRoot, "deps"), { force: true, recursive: true });
  await rm(path.join(moduleRoot, "src"), { force: true, recursive: true });
  await mkdir(path.join(moduleRoot, "build", "Release"), { recursive: true });
  await cp(stagedBinaryPath, compiledBinaryPath);
  await rm(stagedBinaryPath, { force: true, recursive: true });
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
    "[desktop] no standalone native dependencies were found to rebuild.",
  );
  process.exit(0);
}

await mkdir(electronGypDir, { recursive: true });
await syncModuleDirectory("better-sqlite3");

const runtimePackageJson = {
  name: `${rootPackageJson.name}-desktop-runtime`,
  private: true,
  version: rootPackageJson.version,
  packageManager: rootPackageJson.packageManager,
  type: rootPackageJson.type ?? "module",
  dependencies: runtimeDependencies,
  devDependencies: {
    electron: getInstalledVersion("electron"),
  },
};

await writeFile(
  targetPackagePath,
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
);

await runWithEnv(
  npmInvocation.command,
  [...npmInvocation.argsPrefix, "rebuild", "better-sqlite3"],
  {
    cwd: targetRoot,
    env: {
      ...(isHostTarget ? { npm_config_build_from_source: "true" } : {}),
      npm_config_arch: targetArch,
      npm_config_platform: targetPlatform,
      npm_config_devdir: electronGypDir,
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_runtime: "electron",
      npm_config_target: getInstalledVersion("electron"),
      npm_config_target_arch: targetArch,
      npm_config_target_platform: targetPlatform,
      npm_config_update_binary: "true",
    },
  },
);

if (isHostTarget) {
  await runWithEnv(
    electronBin,
    [
      "-e",
      "const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log(db.prepare('select 1 as value').get().value); db.close();",
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
    `[desktop] skipping better-sqlite3 runtime verification for cross-target ${targetPlatform}-${targetArch}`,
  );
}

await pruneBetterSqlite3Runtime();

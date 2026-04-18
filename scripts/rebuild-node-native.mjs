import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);
const NATIVE_MODULES = ["better-sqlite3", "node-pty"];
const nodeGypCliPath = path.join(
  projectRoot,
  "node_modules",
  "node-gyp",
  "bin",
  "node-gyp.js",
);
const prebuildInstallCliPath = path.join(
  projectRoot,
  "node_modules",
  "prebuild-install",
  "bin.js",
);

function canLoadNativeModule(moduleName) {
  try {
    if (moduleName === "better-sqlite3") {
      const Database = require(moduleName);
      const db = new Database(":memory:");
      db.prepare("select 1 as value").get();
      db.close();
    } else {
      require(moduleName);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[native] repairing ${moduleName}: ${message}`);
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
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

async function runNodeCli(cliPath, args, options = {}) {
  if (!existsSync(cliPath)) {
    throw new Error(`Expected CLI entrypoint at ${cliPath}.`);
  }

  await run(process.execPath, [cliPath, ...args], options);
}

function getModuleRoot(moduleName) {
  return path.join(projectRoot, "node_modules", moduleName);
}

async function rebuildBetterSqlite3() {
  const moduleRoot = getModuleRoot("better-sqlite3");

  try {
    await runNodeCli(prebuildInstallCliPath, [], {
      cwd: moduleRoot,
      env: {
        ...process.env,
        npm_config_build_from_source: "true",
      },
    });
  } catch {
    // Fall back to a local source build when a matching prebuild is unavailable.
  }

  await runNodeCli(nodeGypCliPath, ["rebuild", "--release"], {
    cwd: moduleRoot,
    env: {
      ...process.env,
      npm_config_build_from_source: "true",
    },
  });
}

async function rebuildNodePty(needsSourceRebuild) {
  const moduleRoot = getModuleRoot("node-pty");
  const rebuildEnv = needsSourceRebuild
    ? {
        ...process.env,
        npm_config_build_from_source: "true",
      }
    : process.env;

  await runNodeCli(nodeGypCliPath, ["rebuild"], {
    cwd: moduleRoot,
    env: rebuildEnv,
  });

  await run(process.execPath, ["scripts/post-install.js"], {
    cwd: moduleRoot,
    env: rebuildEnv,
  });
}

async function rebuildNativeModule(moduleName, options = {}) {
  if (moduleName === "better-sqlite3") {
    await rebuildBetterSqlite3();
    return;
  }

  if (moduleName === "node-pty") {
    await rebuildNodePty(Boolean(options.needsSourceRebuild));
    return;
  }

  throw new Error(`Unsupported native module rebuild target: ${moduleName}`);
}

function getNodePtySpawnHelperCandidates() {
  return [
    path.join(
      projectRoot,
      "node_modules",
      "node-pty",
      "build",
      "Release",
      "spawn-helper",
    ),
    path.join(
      projectRoot,
      "node_modules",
      "node-pty",
      "build",
      "Debug",
      "spawn-helper",
    ),
    path.join(
      projectRoot,
      "node_modules",
      "node-pty",
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    ),
  ];
}

function hasNodePtySpawnHelper() {
  if (process.platform !== "darwin") {
    return true;
  }

  return getNodePtySpawnHelperCandidates().some((helperPath) =>
    existsSync(helperPath),
  );
}

function ensureNodePtySpawnHelperExecutable() {
  if (process.platform === "win32") {
    return;
  }

  for (const helperPath of getNodePtySpawnHelperCandidates()) {
    if (!existsSync(helperPath)) {
      continue;
    }

    chmodSync(helperPath, 0o755);
    return;
  }
}

for (const moduleName of NATIVE_MODULES) {
  const needsNodePtySourceRebuild =
    moduleName === "node-pty" &&
    process.platform === "darwin" &&
    !hasNodePtySpawnHelper();

  if (!canLoadNativeModule(moduleName) || needsNodePtySourceRebuild) {
    await rebuildNativeModule(moduleName, {
      needsSourceRebuild: needsNodePtySourceRebuild,
    });
  }

  if (!canLoadNativeModule(moduleName)) {
    throw new Error(
      `${moduleName} is still not loadable for ${path.basename(process.execPath)}.`,
    );
  }

  if (
    moduleName === "node-pty" &&
    process.platform === "darwin" &&
    !hasNodePtySpawnHelper()
  ) {
    throw new Error(
      `node-pty is loadable, but spawn-helper is still missing for ${process.platform}-${process.arch}.`,
    );
  }
}

ensureNodePtySpawnHelperExecutable();

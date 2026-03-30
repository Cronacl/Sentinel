import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const NATIVE_MODULES = ["better-sqlite3", "node-pty"];

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
    const rebuildEnv = needsNodePtySourceRebuild
      ? {
          ...process.env,
          npm_config_build_from_source: "true",
        }
      : process.env;

    await run(npmExecutable, ["rebuild", moduleName], {
      env: rebuildEnv,
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

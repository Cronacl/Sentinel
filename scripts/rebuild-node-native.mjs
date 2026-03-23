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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
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

function ensureNodePtySpawnHelperExecutable() {
  if (process.platform === "win32") {
    return;
  }

  const helperCandidates = [
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

  for (const helperPath of helperCandidates) {
    if (!existsSync(helperPath)) {
      continue;
    }

    chmodSync(helperPath, 0o755);
    return;
  }
}

for (const moduleName of NATIVE_MODULES) {
  if (!canLoadNativeModule(moduleName)) {
    await run(npmExecutable, ["rebuild", moduleName]);
  }

  if (!canLoadNativeModule(moduleName)) {
    throw new Error(
      `${moduleName} is still not loadable for ${path.basename(process.execPath)}.`,
    );
  }
}

ensureNodePtySpawnHelperExecutable();

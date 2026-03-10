import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);

function canLoadBetterSqlite3() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.prepare("select 1 as value").get();
    db.close();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[native] repairing better-sqlite3: ${message}`);
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

if (!canLoadBetterSqlite3()) {
  await run("npm", ["rebuild", "better-sqlite3"]);
}

if (!canLoadBetterSqlite3()) {
  throw new Error(
    `better-sqlite3 is still not loadable for ${path.basename(process.execPath)}.`,
  );
}

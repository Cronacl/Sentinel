import { spawn } from "node:child_process";
import path from "node:path";

const PLATFORM_CONFIG = {
  linux: {
    builderFlag: "--linux",
    defaultTarget: "AppImage",
  },
  mac: {
    builderFlag: "--mac",
    defaultTarget: "dmg",
  },
  win: {
    builderFlag: "--win",
    defaultTarget: "nsis",
  },
};

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
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
  });
}

const platform = getArgValue("--platform");
if (!platform || !Object.hasOwn(PLATFORM_CONFIG, platform)) {
  throw new Error('Expected "--platform" to be one of: mac, win, linux.');
}

const target =
  getArgValue("--target") ?? PLATFORM_CONFIG[platform].defaultTarget;

const electronBuilderCli = path.join(
  process.cwd(),
  "node_modules",
  "electron-builder",
  "cli.js",
);

await run(process.execPath, [
  electronBuilderCli,
  PLATFORM_CONFIG[platform].builderFlag,
  target,
  "--publish",
  "never",
]);

await run(process.execPath, [
  "./scripts/desktop/audit-bundle.mjs",
  "--platform",
  platform,
]);

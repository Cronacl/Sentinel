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

function hasMacSigningCredentials() {
  return Boolean(process.env.CSC_LINK?.trim() || process.env.CSC_NAME?.trim());
}

function hasMacNotarizationCredentials() {
  return Boolean(
    process.env.APPLE_ID?.trim() &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim() &&
    process.env.APPLE_TEAM_ID?.trim(),
  );
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

const builderArgs = [
  PLATFORM_CONFIG[platform].builderFlag,
  target,
  "--publish",
  "never",
];

if (platform === "mac") {
  if (!hasMacSigningCredentials()) {
    // Apple Silicon runners otherwise fall back to ad-hoc signing, which breaks
    // unsigned builds and tries to sign non-mac helper payloads in dependencies.
    builderArgs.push("-c.mac.identity=null", "-c.mac.notarize=false");
  } else if (!hasMacNotarizationCredentials()) {
    builderArgs.push("-c.mac.notarize=false");
  }
}

await run(process.execPath, [electronBuilderCli, ...builderArgs]);

await run(process.execPath, [
  "./scripts/desktop/audit-bundle.mjs",
  "--platform",
  platform,
]);

import { spawn } from "node:child_process";
import path from "node:path";

const PLATFORM_CONFIG = {
  linux: {
    builderFlag: "--linux",
    defaultTargets: ["AppImage", "deb", "rpm"],
    nodePlatform: "linux",
  },
  mac: {
    builderFlag: "--mac",
    defaultTargets: ["dmg", "zip"],
    nodePlatform: "darwin",
  },
  win: {
    builderFlag: "--win",
    defaultTargets: ["nsis"],
    nodePlatform: "win32",
  },
};
const SUPPORTED_ARCHS = new Set([
  "arm64",
  "armv7l",
  "ia32",
  "universal",
  "x64",
]);

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getArgValues(flag) {
  const values = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== flag) {
      continue;
    }

    const value = process.argv[index + 1];
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function normalizeArch(arch) {
  return arch === "arm" ? "armv7l" : arch;
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

const targets = [
  ...new Set(
    getArgValues("--target")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];
const archs = [...new Set(getArgValues("--arch").map(normalizeArch))];

const electronBuilderCli = path.join(
  process.cwd(),
  "node_modules",
  "electron-builder",
  "cli.js",
);

const builderArgs = [
  PLATFORM_CONFIG[platform].builderFlag,
  ...(targets.length > 0 ? targets : PLATFORM_CONFIG[platform].defaultTargets),
  "--publish",
  "never",
];

for (const arch of archs) {
  if (!SUPPORTED_ARCHS.has(arch)) {
    throw new Error(
      `Unsupported "--arch" value "${arch}". Expected one of: arm64, armv7l, ia32, universal, x64.`,
    );
  }

  builderArgs.push(`--${arch}`);
}

const targetArchs = archs.length > 0 ? archs : [normalizeArch(process.arch)];
const concreteTargetArchs = targetArchs.filter((arch) => arch !== "universal");

if (concreteTargetArchs.length !== 1) {
  throw new Error(
    "Desktop packaging currently supports exactly one concrete target architecture per build.",
  );
}

const targetArch = concreteTargetArchs[0];

if (platform === "mac") {
  if (!hasMacSigningCredentials()) {
    // Apple Silicon runners otherwise fall back to ad-hoc signing, which breaks
    // unsigned builds and tries to sign non-mac helper payloads in dependencies.
    builderArgs.push("-c.mac.identity=null", "-c.mac.notarize=false");
  } else if (!hasMacNotarizationCredentials()) {
    builderArgs.push("-c.mac.notarize=false");
  }
}

await run(process.execPath, [
  "./scripts/desktop/preflight.mjs",
  "--platform",
  platform,
]);

await run(process.execPath, [
  "./scripts/desktop/rebuild-standalone-native.mjs",
  "--platform",
  PLATFORM_CONFIG[platform].nodePlatform,
  "--arch",
  targetArch,
]);

await run(process.execPath, [electronBuilderCli, ...builderArgs]);

await run(process.execPath, [
  "./scripts/desktop/audit-bundle.mjs",
  "--platform",
  platform,
]);

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const buildStateRoot = path.join(projectRoot, ".sentinel-build");
const buildHome = path.join(buildStateRoot, "home");
const nextBin = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const DEFAULT_ENCRYPTION_KEY =
  "1111111111111111111111111111111111111111111111111111111111111111";

mkdirSync(buildHome, { recursive: true });

const env = {
  ...process.env,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? DEFAULT_ENCRYPTION_KEY,
  HOME: buildHome,
  SENTINEL_DB_PATH:
    process.env.SENTINEL_DB_PATH ?? path.join(buildStateRoot, "sentinel.db"),
  SENTINEL_SKIP_STARTUP_TASKS: process.env.SENTINEL_SKIP_STARTUP_TASKS ?? "1",
  SENTINEL_STATE_PATH:
    process.env.SENTINEL_STATE_PATH ?? path.join(buildStateRoot, "state.json"),
  SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? "1",
  USERPROFILE: buildHome,
};

if (!env.NODE_OPTIONS?.includes("--max-old-space-size=")) {
  env.NODE_OPTIONS = env.NODE_OPTIONS
    ? `${env.NODE_OPTIONS} --max-old-space-size=4096`
    : "--max-old-space-size=4096";
}

if (process.platform === "win32") {
  const homeRoot = path.parse(buildHome).root;
  env.HOMEDRIVE = homeRoot.endsWith(path.sep)
    ? homeRoot.slice(0, -1)
    : homeRoot;
  env.HOMEPATH = buildHome.replace(/^[A-Za-z]:/, "");
}

const child = spawn(process.execPath, [nextBin, "build"], {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`next build exited with signal ${signal}`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 1);
});

import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

import {
  APP_HOST,
  APP_PORT,
  APP_URL,
  POSTGRES_PORT,
  QDRANT_PORT,
  REDIS_PORT,
} from "./constants.mjs";
import { readTextFile, writeTextFile } from "./state.mjs";

const execFileAsync = promisify(execFile);
const RUNTIME_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "NEXT_PUBLIC_URL",
  "QDRANT_URL",
  "REDIS_URL",
  "SENTINEL_STATE_PATH",
];

function parseDotEnv(content) {
  return content.split("\n").reduce((accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    accumulator[key] = rawValue.replace(/^"(.*)"$/, "$1");
    return accumulator;
  }, {});
}

function buildDefaultEnv() {
  return {
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: APP_URL,
    DATABASE_URL: `postgresql://postgres:postgres@${APP_HOST}:${POSTGRES_PORT}/sentinel`,
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: `${APP_URL}/api/auth/callback/google`,
    NEXT_PUBLIC_URL: APP_URL,
    QDRANT_URL: `http://${APP_HOST}:${QDRANT_PORT}`,
    REDIS_URL: `redis://${APP_HOST}:${REDIS_PORT}`,
  };
}

function getProcessRuntimeOverrides() {
  return RUNTIME_ENV_KEYS.reduce((accumulator, key) => {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
}

function serializeEnv(envObject) {
  return Object.entries(envObject)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
}

async function execCommand(file, args, options = {}) {
  await execFileAsync(file, args, {
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function canConnectToPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: APP_HOST, port });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isQdrantAvailable() {
  try {
    const response = await fetch(`http://${APP_HOST}:${QDRANT_PORT}`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadRuntimeEnv(runtimePaths) {
  const defaults = buildDefaultEnv();
  const existing = await readTextFile(runtimePaths.envPath);
  const overrides = getProcessRuntimeOverrides();

  if (!existing) {
    return {
      ...defaults,
      ...overrides,
    };
  }

  return {
    ...defaults,
    ...parseDotEnv(existing),
    ...overrides,
  };
}

export async function ensureLocalEnv(runtimePaths) {
  const existing = await readTextFile(runtimePaths.envPath);
  const nextEnv = buildDefaultEnv();
  const overrides = getProcessRuntimeOverrides();

  if (existing) {
    const mergedEnv = {
      ...nextEnv,
      ...parseDotEnv(existing),
      ...overrides,
    };

    await writeTextFile(runtimePaths.envPath, `${serializeEnv(mergedEnv)}\n`);
    return mergedEnv;
  }

  const initialEnv = {
    ...nextEnv,
    ...overrides,
  };
  await writeTextFile(runtimePaths.envPath, `${serializeEnv(initialEnv)}\n`);
  return initialEnv;
}

export async function isDockerAvailable() {
  try {
    await execCommand("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
}

export async function getInfrastructureStatus(runtimePaths) {
  const docker = await isDockerAvailable();
  const [postgres, redis, qdrant] = docker
    ? await Promise.all([
        canConnectToPort(POSTGRES_PORT),
        canConnectToPort(REDIS_PORT),
        isQdrantAvailable(),
      ])
    : [false, false, false];

  return {
    appServer: false,
    docker,
    postgres,
    qdrant,
    redis,
  };
}

export async function startInfrastructure(runtimePaths) {
  const env = await ensureLocalEnv(runtimePaths);

  await execCommand(
    "docker",
    ["compose", "-f", runtimePaths.composePath, "up", "-d"],
    { env },
  );

  return getInfrastructureStatus(runtimePaths);
}

export async function stopInfrastructure(runtimePaths) {
  const env = await loadRuntimeEnv(runtimePaths);

  await execCommand(
    "docker",
    ["compose", "-f", runtimePaths.composePath, "stop"],
    { env },
  );

  return getInfrastructureStatus(runtimePaths);
}

export async function waitForInfrastructure(runtimePaths, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getInfrastructureStatus(runtimePaths);
    if (status.postgres && status.redis && status.qdrant) {
      return status;
    }

    await wait(1_000);
  }

  throw new Error("Local services did not become healthy in time.");
}

export async function syncPrismaSchema(runtimePaths) {
  const env = await loadRuntimeEnv(runtimePaths);
  const prismaCliPath = runtimePaths.isPackaged
    ? path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "prisma",
        "build",
        "index.js",
      )
    : path.join(
        runtimePaths.appRoot,
        "node_modules",
        "prisma",
        "build",
        "index.js",
      );

  await execCommand(
    process.execPath,
    [
      prismaCliPath,
      "db",
      "push",
      "--skip-generate",
      "--schema",
      runtimePaths.schemaPath,
    ],
    {
      cwd: runtimePaths.isPackaged
        ? path.join(process.resourcesPath, "server")
        : runtimePaths.appRoot,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        HOSTNAME: APP_HOST,
        PORT: String(APP_PORT),
      },
    },
  );
}

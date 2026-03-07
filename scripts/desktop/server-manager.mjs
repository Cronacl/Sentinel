import { spawn } from "node:child_process";
import path from "node:path";

import { APP_HOST, APP_PORT, APP_URL } from "./constants.mjs";
import { loadRuntimeEnv } from "./service-manager.mjs";

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function waitForAppServer(baseUrl, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch {}

    await wait(1_000);
  }

  throw new Error("Sentinel app server did not become ready in time.");
}

export async function getAppServerStatus(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function startLocalServer(runtimePaths) {
  if (process.env.SENTINEL_APP_URL) {
    await waitForAppServer(process.env.SENTINEL_APP_URL);
    return {
      process: null,
      url: process.env.SENTINEL_APP_URL,
    };
  }

  if (!runtimePaths.serverEntryPath) {
    throw new Error("Packaged server entrypoint is missing.");
  }

  const env = await loadRuntimeEnv(runtimePaths);
  const child = spawn(process.execPath, [runtimePaths.serverEntryPath], {
    cwd: runtimePaths.isPackaged
      ? path.dirname(runtimePaths.serverEntryPath)
      : runtimePaths.appRoot,
    env: {
      ...process.env,
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: APP_HOST,
      NODE_ENV: "production",
      PORT: String(APP_PORT),
    },
    stdio: "inherit",
  });

  await waitForAppServer(APP_URL);

  return {
    process: child,
    url: APP_URL,
  };
}

export async function stopLocalServer(serverState) {
  if (!serverState?.process || serverState.process.killed) {
    return;
  }

  serverState.process.kill("SIGTERM");
}

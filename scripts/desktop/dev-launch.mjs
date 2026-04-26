import { spawn } from "node:child_process";
import path from "node:path";

const HEALTHCHECK_URL = "http://localhost:3232/api/health";
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 300_000;
const ELECTRON_ENTRY = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  "electron",
);

function getHealthcheckTimeoutMs() {
  const configuredTimeout = process.env.SENTINEL_DESKTOP_DEV_TIMEOUT_MS;

  if (!configuredTimeout) {
    return DEFAULT_HEALTHCHECK_TIMEOUT_MS;
  }

  const timeoutMs = Number(configuredTimeout);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }

  console.warn(
    `[desktop] ignoring invalid SENTINEL_DESKTOP_DEV_TIMEOUT_MS=${configuredTimeout}`,
  );
  return DEFAULT_HEALTHCHECK_TIMEOUT_MS;
}

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitForHealthcheck(timeoutMs = getHealthcheckTimeoutMs()) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(HEALTHCHECK_URL);
      if (response.ok) {
        return;
      }
    } catch {}

    await wait(500);
  }

  throw new Error(
    `Timed out waiting for the dev server healthcheck at ${HEALTHCHECK_URL}.`,
  );
}

await waitForHealthcheck();

const child = spawn(ELECTRON_ENTRY, ["."], {
  env: {
    ...process.env,
    SENTINEL_APP_URL: "http://localhost:3232",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

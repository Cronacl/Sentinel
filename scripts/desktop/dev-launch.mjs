import { spawn } from "node:child_process";
import path from "node:path";

const HEALTHCHECK_URL = "http://127.0.0.1:3232/api/health";
const ELECTRON_ENTRY = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  "electron",
);

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitForHealthcheck(timeoutMs = 45_000) {
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
    SENTINEL_APP_URL: "http://127.0.0.1:3232",
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

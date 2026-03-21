import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

import { APP_HOST, APP_PORT, APP_URL } from "./constants.mjs";
import { loadRuntimeEnv } from "./service-manager.mjs";

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function getPackagedServerRuntimeCommand() {
  if (process.platform !== "darwin") {
    return {
      args: [],
      command: process.execPath,
    };
  }

  const executableName = path.basename(process.execPath);
  const helperName = `${executableName} Helper (Plugin)`;

  return {
    args: [],
    command: path.join(
      path.dirname(path.dirname(process.execPath)),
      "Frameworks",
      `${helperName}.app`,
      "Contents",
      "MacOS",
      helperName,
    ),
  };
}

export async function waitForAppServer(
  baseUrl,
  { getFailureReason, intervalMs = 200, timeoutMs = 20_000 } = {},
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const failureReason = getFailureReason?.();
    if (failureReason) {
      throw failureReason;
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch {}

    await wait(intervalMs);
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

function getWindowsPidsOnPort(port) {
  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf-8",
    });

    return Array.from(
      new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => line.split(/\s+/))
          .filter((parts) => parts.length >= 5)
          .filter((parts) => parts[1]?.endsWith(`:${port}`))
          .map((parts) => parts.at(-1))
          .filter((pid) => Boolean(pid) && /^\d+$/.test(pid)),
      ),
    );
  } catch {
    return [];
  }
}

function getUnixPidsOnPort(port) {
  try {
    const output = execFileSync("lsof", ["-ti", `:${port}`], {
      encoding: "utf-8",
    });

    return output
      .trim()
      .split("\n")
      .filter((pid) => /^\d+$/.test(pid));
  } catch {
    return [];
  }
}

export async function killProcessOnPort(port) {
  const pids =
    process.platform === "win32"
      ? getWindowsPidsOnPort(port)
      : getUnixPidsOnPort(port);

  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        process.kill(Number(pid), "SIGKILL");
      }
    } catch {}
  }

  if (pids.length > 0) {
    await wait(500);
  }
}

export async function startLocalServer(runtimePaths) {
  if (process.env.SENTINEL_APP_URL) {
    return {
      process: null,
      url: process.env.SENTINEL_APP_URL,
    };
  }

  if (!runtimePaths.serverEntryPath) {
    throw new Error("Packaged server entrypoint is missing.");
  }

  await killProcessOnPort(APP_PORT);

  const env = await loadRuntimeEnv(runtimePaths);
  const runtimeCommand = getPackagedServerRuntimeCommand();
  const child = spawn(
    runtimeCommand.command,
    [...runtimeCommand.args, runtimePaths.serverEntryPath],
    {
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
      stdio: "pipe",
    },
  );

  let startupFailure = null;

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.once("exit", (code, signal) => {
    startupFailure = new Error(
      signal
        ? `Sentinel app server exited with signal ${signal} before becoming ready.`
        : `Sentinel app server exited with code ${code ?? 1} before becoming ready.`,
    );
  });

  try {
    await waitForAppServer(APP_URL, {
      getFailureReason: () => startupFailure,
    });
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    process: child,
    url: APP_URL,
  };
}

export async function stopLocalServer(serverState) {
  if (!serverState?.process || serverState.process.killed) {
    return;
  }

  const child = serverState.process;

  await new Promise((resolve) => {
    let exited = false;

    const onExit = () => {
      exited = true;
      clearTimeout(forceKillTimer);
      resolve();
    };

    child.once("exit", onExit);
    child.kill("SIGTERM");

    const forceKillTimer = setTimeout(() => {
      if (!exited) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
      setTimeout(resolve, 1000);
    }, 3000);
  });
}

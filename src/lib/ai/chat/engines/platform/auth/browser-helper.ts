import "server-only";

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSafeAuthUrl } from "./terminal-command";

// A BROWSER helper for agents that open their sign-in page themselves
// (Antigravity, some ACP agents; critique G13): with BROWSER pointing at it,
// the agent's "open this URL" prints the URL behind a marker on stderr
// instead of opening a browser, and the driver shows it as a browser
// interaction. It is a /bin/sh script (a .cmd on Windows) so it needs no
// Node interpreter in packaged builds, and it never evaluates the URL.
// Marker idea from t3code (apps/server/src/provider/antigravityAuthSupport.ts,
// MIT), which uses a Node helper.

export const AUTH_URL_MARKER = "__SENTINEL_AUTH_URL__";

const DIRECTORY_MODE = 0o700;
const SCRIPT_MODE = 0o700;

export function buildAuthBrowserHelperScript(
  platform: NodeJS.Platform = process.platform,
) {
  if (platform === "win32") {
    return {
      content: [
        "@echo off",
        "rem Written by Sentinel: prints the sign-in URL an agent opens for Sentinel to show.",
        `>&2 echo ${AUTH_URL_MARKER}"%~1"`,
        "",
      ].join("\r\n"),
      fileName: "sentinel-auth-browser.cmd",
    };
  }

  return {
    content: [
      "#!/bin/sh",
      "# Written by Sentinel: prints the sign-in URL an agent opens for Sentinel to show.",
      `printf '%s"%s"\\n' '${AUTH_URL_MARKER}' "$1" >&2`,
      "",
    ].join("\n"),
    fileName: "sentinel-auth-browser.sh",
  };
}

/**
 * Writes the helper into `directory` (an instance's state directory) when
 * it is missing or outdated, and returns its path for BROWSER.
 */
export async function ensureAuthBrowserHelper(
  directory: string,
  options: {
    fs?: {
      chmod: typeof chmod;
      mkdir: typeof mkdir;
      readFile: typeof readFile;
      writeFile: typeof writeFile;
    };
    platform?: NodeJS.Platform;
  } = {},
) {
  const fs = options.fs ?? { chmod, mkdir, readFile, writeFile };
  const platform = options.platform ?? process.platform;
  const { content, fileName } = buildAuthBrowserHelperScript(platform);
  const target = (platform === "win32" ? path.win32 : path.posix).join(
    directory,
    fileName,
  );

  const current = await fs.readFile(target, "utf8").catch(() => null);
  if (current !== content) {
    await fs.mkdir(directory, { mode: DIRECTORY_MODE, recursive: true });
    await fs.writeFile(target, content, {
      encoding: "utf8",
      mode: SCRIPT_MODE,
    });
  }
  if (platform !== "win32") {
    await fs.chmod(target, SCRIPT_MODE);
  }
  return target;
}

/** The variables that route an agent's browser through the helper. */
export function authBrowserEnv(helperPath: string) {
  return { BROWSER: helperPath };
}

/**
 * The sign-in URL in one line of an agent's stderr, or null. Only https
 * (or loopback http) URLs are taken.
 */
export function parseAuthBrowserMarker(line: string) {
  const index = line.indexOf(AUTH_URL_MARKER);
  if (index === -1) {
    return null;
  }

  const rest = line.slice(index + AUTH_URL_MARKER.length).trim();
  const end = rest.lastIndexOf('"');
  if (!rest.startsWith('"') || end <= 0) {
    return null;
  }

  const url = rest.slice(1, end).trim();
  return isSafeAuthUrl(url) ? url : null;
}

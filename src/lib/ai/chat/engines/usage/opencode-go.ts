import "server-only";

import { createHash } from "node:crypto";
import { readFile as nodeReadFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  clampUsagePercent,
  makeEngineUsageLimits,
  makeUnavailableEngineUsageLimits,
  type EngineUsageLimits,
  type EngineUsageWindow,
} from "../contract";

// OpenCode Go subscription usage. Read only when the user configured Go in
// OpenCode itself (an `opencode-go` API credential in OpenCode's auth
// file, or OPENCODE_AUTH_CONTENT); without it the instance reports no
// usage and nothing is sent anywhere. Ported from t3code
// apps/server/src/provider/openCodeUsageLimits.ts (MIT).

export const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

type GoWindow = { percent?: unknown; resetsAt?: unknown };
type GoUsageResponse = {
  usage?: { monthly?: GoWindow; rolling?: GoWindow; weekly?: GoWindow };
};

export type OpenCodeGoUsageDeps = {
  fetch?: typeof fetch;
  homeDirectory?: string;
  now?: () => number;
  readFile?: (target: string, encoding: "utf8") => Promise<string>;
};

/** OpenCode's auth file (xdg-basedir data home, as OpenCode resolves it). */
export function getOpenCodeAuthFilePath(
  env: Record<string, string | undefined>,
  homeDirectory: string,
) {
  const dataHome =
    env.XDG_DATA_HOME?.trim() ||
    path.join(
      env.HOME?.trim() || env.USERPROFILE?.trim() || homeDirectory,
      ".local",
      "share",
    );
  return path.join(dataHome, "opencode", "auth.json");
}

function readGoApiKey(contents: string) {
  try {
    const auth = JSON.parse(contents) as Record<string, unknown> | null;
    const entry = auth?.["opencode-go"] as
      { key?: unknown; type?: unknown } | undefined;
    return entry?.type === "api" &&
      typeof entry.key === "string" &&
      entry.key.trim()
      ? entry.key.trim()
      : null;
  } catch {
    return null;
  }
}

function toWindow(
  value: GoWindow | undefined,
  base: Omit<EngineUsageWindow, "resetsAt" | "usedPercent">,
): EngineUsageWindow | null {
  if (typeof value?.percent !== "number" || !Number.isFinite(value.percent)) {
    return null;
  }
  const reset =
    typeof value.resetsAt === "string" ? new Date(value.resetsAt) : null;
  return {
    ...base,
    usedPercent: clampUsagePercent(value.percent),
    ...(reset && !Number.isNaN(reset.getTime())
      ? { resetsAt: reset.toISOString() }
      : {}),
  };
}

export function openCodeGoUsageToLimits(
  body: GoUsageResponse,
  input: { apiKey: string; checkedAt: string },
): EngineUsageLimits {
  const windows = [
    toWindow(body.usage?.rolling, {
      id: "go_rolling",
      kind: "session",
      label: "Go · Session",
      windowDurationMins: 5 * 60,
    }),
    toWindow(body.usage?.weekly, {
      id: "go_weekly",
      kind: "weekly",
      label: "Go · Weekly",
      windowDurationMins: 7 * 24 * 60,
    }),
    toWindow(body.usage?.monthly, {
      id: "go_monthly",
      kind: "monthly",
      label: "Go · Monthly",
    }),
  ].filter((window): window is EngineUsageWindow => window !== null);

  // Go's answer names no account: an unkeyed hash of the key tells two
  // instances on the same subscription apart from two different ones.
  return makeEngineUsageLimits({
    checkedAt: input.checkedAt,
    credentialFingerprint: createHash("sha256")
      .update(`opencode-go\0${input.apiKey}`)
      .digest("hex"),
    windows,
  });
}

export async function readOpenCodeGoUsageLimits(
  input: { env: Record<string, string | undefined>; signal: AbortSignal },
  deps: OpenCodeGoUsageDeps = {},
): Promise<EngineUsageLimits> {
  const checkedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const unsupported = makeUnavailableEngineUsageLimits({
    checkedAt,
    reason: "unsupported",
  });

  let contents = input.env.OPENCODE_AUTH_CONTENT?.trim() || null;
  if (!contents) {
    try {
      contents = await (deps.readFile ?? nodeReadFile)(
        getOpenCodeAuthFilePath(input.env, deps.homeDirectory ?? os.homedir()),
        "utf8",
      );
    } catch {
      return unsupported;
    }
  }
  const apiKey = readGoApiKey(contents);
  if (!apiKey) {
    return unsupported;
  }

  const failed = makeUnavailableEngineUsageLimits({
    checkedAt,
    message: "OpenCode Go could not read usage.",
    reason: "probeFailed",
  });
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(OPENCODE_GO_USAGE_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
      method: "GET",
      signal: input.signal,
    });
  } catch {
    return failed;
  }
  // A valid Zen key can exist without a Go subscription.
  if (response.status === 403) {
    return unsupported;
  }
  if (!response.ok) {
    return failed;
  }
  try {
    const body = (await response.json()) as GoUsageResponse;
    const limits = openCodeGoUsageToLimits(body ?? {}, { apiKey, checkedAt });
    return limits.windows.length > 0 ? limits : failed;
  } catch {
    return failed;
  }
}

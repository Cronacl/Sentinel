import "server-only";

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

// Cursor plan usage from its dashboard API (GetCurrentPeriodUsage). The
// token comes from CURSOR_AUTH_TOKEN, else the CLI's auth file, else a
// Keychain login the user asked Sentinel to read (cursor-keychain.ts); the
// Keychain itself is never read from here. Ported from t3code
// apps/server/src/provider/cursorUsageLimits.ts (MIT).

export const DEFAULT_CURSOR_API_ENDPOINT = "https://api2.cursor.sh";
const USAGE_PATH = "/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

/** Cursor's dashboard percentages; ids are the response fields. */
export const CURSOR_USAGE_WINDOWS = [
  { id: "totalPercentUsed", label: "Overall" },
  { id: "autoPercentUsed", label: "Cursor models" },
  { id: "apiPercentUsed", label: "Other models" },
] as const;

type CursorUsageResponse = {
  billingCycleEnd?: number | string;
  planUsage?: Partial<
    Record<(typeof CURSOR_USAGE_WINDOWS)[number]["id"], number>
  >;
};

export type CursorTokenSource = "env" | "file" | "keychain";

export type CursorUsageReadResult = {
  limits: EngineUsageLimits;
  /** The token was refused: a cached Keychain token should be dropped. */
  rejected: boolean;
  source: CursorTokenSource | null;
};

export type CursorUsageDeps = {
  fetch?: typeof fetch;
  homeDirectory?: string;
  now?: () => number;
  platform?: NodeJS.Platform;
  readFile?: (target: string, encoding: "utf8") => Promise<string>;
};

/** Where the Cursor CLI keeps a file-based login on each platform. */
export function getCursorAuthFilePaths(
  env: Record<string, string | undefined>,
  options: { homeDirectory: string; platform: NodeJS.Platform },
) {
  const home =
    (options.platform === "win32" ? env.USERPROFILE : env.HOME)?.trim() ||
    options.homeDirectory;
  if (options.platform === "win32") {
    return [
      path.join(
        env.APPDATA?.trim() || path.join(home, "AppData", "Roaming"),
        "Cursor",
        "auth.json",
      ),
    ];
  }
  if (options.platform === "darwin") {
    return [path.join(home, ".cursor", "auth.json")];
  }
  return [
    path.join(
      env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config"),
      "cursor",
      "auth.json",
    ),
    path.join(home, ".cursor", "auth.json"),
  ];
}

async function readAuthFileToken(
  paths: readonly string[],
  readFile: NonNullable<CursorUsageDeps["readFile"]>,
) {
  for (const candidate of paths) {
    let raw: string;
    try {
      raw = await readFile(candidate, "utf8");
    } catch {
      continue;
    }
    try {
      const token = (JSON.parse(raw) as { accessToken?: unknown }).accessToken;
      if (typeof token === "string" && token.trim()) {
        return token.trim();
      }
    } catch {
      // An unreadable file is the same as no file.
    }
  }
  return null;
}

/** Cursor's dashboard percentages include bonus usage, as Cursor shows it. */
export function cursorUsageResponseToLimits(
  response: CursorUsageResponse,
  checkedAt: string,
): EngineUsageLimits {
  const cycleEnd = Number(response.billingCycleEnd);
  const resetsAt =
    Number.isFinite(cycleEnd) && cycleEnd > 0
      ? new Date(cycleEnd).toISOString()
      : undefined;
  const windows: EngineUsageWindow[] = [];
  for (const { id, label } of CURSOR_USAGE_WINDOWS) {
    const usedPercent = response.planUsage?.[id];
    if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
      continue;
    }
    windows.push({
      id,
      kind: "monthly",
      label,
      usedPercent: clampUsagePercent(usedPercent),
      ...(resetsAt ? { resetsAt } : {}),
    });
  }
  // With both pools reported, "Overall" only restates them.
  const hasBothPools =
    windows.some((window) => window.id === "autoPercentUsed") &&
    windows.some((window) => window.id === "apiPercentUsed");
  const shown = hasBothPools
    ? windows.filter((window) => window.id !== "totalPercentUsed")
    : windows;

  return shown.length > 0
    ? makeEngineUsageLimits({ checkedAt, windows: shown })
    : makeUnavailableEngineUsageLimits({ checkedAt, reason: "unsupported" });
}

export async function readCursorUsageLimits(
  input: {
    env: Record<string, string | undefined>;
    /** A token the user let Sentinel read from the Keychain, if any. */
    keychainToken: string | null;
    signal: AbortSignal;
  },
  deps: CursorUsageDeps = {},
): Promise<CursorUsageReadResult> {
  const now = deps.now ?? Date.now;
  const platform = deps.platform ?? process.platform;
  const checkedAt = new Date(now()).toISOString();
  const env = input.env;
  const endpoint = (
    env.CURSOR_API_ENDPOINT?.trim() || DEFAULT_CURSOR_API_ENDPOINT
  ).replace(/\/+$/, "");

  let source: CursorTokenSource | null = null;
  let token = env.CURSOR_AUTH_TOKEN?.trim() || null;
  if (token) {
    source = "env";
  } else if (env.CURSOR_API_KEY?.trim()) {
    // An API key can name another account than the stored login.
    return {
      limits: makeUnavailableEngineUsageLimits({
        checkedAt,
        message: "Cursor does not report plan usage for API keys.",
        reason: "unsupported",
      }),
      rejected: false,
      source: null,
    };
  } else {
    token = await readAuthFileToken(
      getCursorAuthFilePaths(env, {
        homeDirectory: deps.homeDirectory ?? os.homedir(),
        platform,
      }),
      deps.readFile ?? nodeReadFile,
    );
    if (token) {
      source = "file";
    } else if (
      input.keychainToken &&
      endpoint === DEFAULT_CURSOR_API_ENDPOINT
    ) {
      // A Keychain login only ever goes to Cursor's own endpoint.
      token = input.keychainToken;
      source = "keychain";
    }
  }

  if (!token) {
    const canUseKeychain =
      platform === "darwin" && endpoint === DEFAULT_CURSOR_API_ENDPOINT;
    return {
      limits: makeUnavailableEngineUsageLimits({
        ...(canUseKeychain ? { action: "read-keychain" as const } : {}),
        checkedAt,
        message: canUseKeychain
          ? "Cursor keeps its login in the macOS Keychain. Allow Sentinel to read it to show usage."
          : "Sign in with the Cursor CLI, or set CURSOR_AUTH_TOKEN, to show usage.",
        reason: "unsupported",
      }),
      rejected: false,
      source: null,
    };
  }

  const failed = (message: string, rejected = false) => ({
    limits: makeUnavailableEngineUsageLimits({
      checkedAt,
      message,
      reason: "probeFailed" as const,
    }),
    rejected,
    source,
  });

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(`${endpoint}${USAGE_PATH}`, {
      body: "{}",
      headers: {
        authorization: `Bearer ${token}`,
        "connect-protocol-version": "1",
        "content-type": "application/json",
        "x-cursor-client-type": "cli",
      },
      method: "POST",
      signal: input.signal,
    });
  } catch {
    return failed("Cursor could not be reached to read usage.");
  }

  if (response.status === 401 || response.status === 403) {
    return failed(
      "Cursor refused the saved login. Sign in again to show usage.",
      true,
    );
  }
  if (!response.ok) {
    return failed("Cursor could not read usage limits.");
  }

  try {
    const body = (await response.json()) as CursorUsageResponse;
    return {
      limits: cursorUsageResponseToLimits(body ?? {}, checkedAt),
      rejected: false,
      source,
    };
  } catch {
    return failed("Cursor answered the usage request in an unexpected shape.");
  }
}

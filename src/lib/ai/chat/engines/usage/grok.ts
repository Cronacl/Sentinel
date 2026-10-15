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

// Grok Build plan usage: the credit percentage of the grok.com login the CLI
// uses by default (`grok login`, kept in <GROK_HOME or ~/.grok>/auth.json, or
// GROK_AUTH). Accounts configured any other way (an API key, a custom
// deployment or endpoint) are left alone: nothing is read or sent for them.
// Ported from t3code packages/provider-grok/src/server/usageLimits.ts (MIT).

export const GROK_BILLING_URL =
  "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

/** The two auth.json entries of the default grok.com login. */
const GROK_LOGIN_KEYS = [
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828",
  "https://accounts.x.ai/sign-in",
];

/** Settings that select another account, scope or endpoint. */
const CUSTOM_DEPLOYMENT_ENV = [
  "GROK_OIDC_ISSUER",
  "GROK_OIDC_CLIENT_ID",
  "GROK_OAUTH2_ISSUER",
  "GROK_OAUTH2_CLIENT_ID",
  "GROK_OAUTH2_PRINCIPAL_TYPE",
  "GROK_OAUTH2_PRINCIPAL_ID",
  "GROK_AUTH_PROVIDER_COMMAND",
  "GROK_LOCAL_AUTH",
  "GROK_CLI_CHAT_PROXY_BASE_URL",
  "GROK_MODELS_BASE_URL",
  "GROK_CONFIG",
  "GROK_CONFIG_PATH",
];

const CUSTOM_CONFIG_SECTION =
  /^\s*(?:\[\[?\s*)?["']?(?:auth|grok_com_config|endpoints)["']?\s*[.\]=]/m;

const READ_TIMEOUT_MS = 10_000;

export type GrokUsageDeps = {
  fetch?: typeof fetch;
  homeDirectory?: string;
  now?: () => number;
  /** Whose home and path rules apply (default: this host's). */
  platform?: NodeJS.Platform;
  readFile?: (target: string, encoding: "utf8") => Promise<string>;
};

export type GrokLogin =
  /** The default grok.com login, with its token. */
  | { email: string | null; status: "signed-in"; token: string }
  /** No grok.com login in the auth file. */
  | { status: "signed-out" }
  /** An API key or a custom deployment: not Sentinel's to read. */
  | { status: "other" };

function grokPath(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/** GROK_HOME, else ~/.grok, with Windows' home in USERPROFILE. */
export function getGrokHomeDirectory(
  env: Record<string, string | undefined>,
  homeDirectory: string,
  platform: NodeJS.Platform = process.platform,
) {
  const home =
    (platform === "win32" ? env.USERPROFILE?.trim() : undefined) ||
    env.HOME?.trim() ||
    homeDirectory;
  return env.GROK_HOME?.trim() || grokPath(platform).join(home, ".grok");
}

async function readOptional(
  read: NonNullable<GrokUsageDeps["readFile"]>,
  target: string,
) {
  try {
    return await read(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** The grok.com login the CLI would use, read from its files only. */
export async function readGrokLogin(
  env: Record<string, string | undefined>,
  deps: GrokUsageDeps = {},
): Promise<GrokLogin> {
  if (env.XAI_API_KEY?.trim()) {
    return { status: "other" };
  }
  if (CUSTOM_DEPLOYMENT_ENV.some((name) => env[name]?.trim())) {
    return { status: "other" };
  }
  const read = deps.readFile ?? nodeReadFile;
  const platform = deps.platform ?? process.platform;
  const join = grokPath(platform).join;
  const home = getGrokHomeDirectory(
    env,
    deps.homeDirectory ?? os.homedir(),
    platform,
  );
  for (const configPath of [
    join(home, "config.toml"),
    join(home, "managed_config.toml"),
    join(home, "requirements.toml"),
    ...(platform === "win32"
      ? []
      : ["/etc/grok/managed_config.toml", "/etc/grok/requirements.toml"]),
  ]) {
    const config = await readOptional(read, configPath).catch(() => null);
    if (config && CUSTOM_CONFIG_SECTION.test(config)) {
      return { status: "other" };
    }
  }

  const contents =
    env.GROK_AUTH?.trim() ||
    (await readOptional(read, join(home, "auth.json")));
  if (!contents) {
    return { status: "signed-out" };
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(contents) as Record<string, unknown>;
  } catch {
    return { status: "other" };
  }
  const entry = GROK_LOGIN_KEYS.map(
    (key) => credentials?.[key] as Record<string, unknown> | undefined,
  ).find((value) => value && typeof value === "object");
  if (!entry) {
    return { status: "signed-out" };
  }
  if (entry.auth_mode === "api_key") {
    return { status: "other" };
  }
  const token = typeof entry.key === "string" ? entry.key.trim() : "";
  if (!token) {
    return { status: "signed-out" };
  }
  const email = typeof entry.email === "string" ? entry.email.trim() : "";
  return { email: email || null, status: "signed-in", token };
}

type GrokBillingResponse = {
  config?: {
    creditUsagePercent?: unknown;
    currentPeriod?: { end?: unknown; type?: unknown };
  };
};

export function grokBillingToLimits(
  body: GrokBillingResponse,
  input: { checkedAt: string; token: string },
): EngineUsageLimits {
  const credentialFingerprint = createHash("sha256")
    .update(`grok\0${input.token}`)
    .digest("hex");
  const percent = body.config?.creditUsagePercent;
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    // xAI omits the field until something is metered: an account with
    // nothing used yet, not one that cannot report.
    return makeEngineUsageLimits({
      checkedAt: input.checkedAt,
      credentialFingerprint,
      windows: [],
    });
  }
  const period = body.config?.currentPeriod;
  const type =
    typeof period?.type === "string"
      ? period.type.replace(/^USAGE_PERIOD_TYPE_/, "")
      : "";
  const kind =
    type === "WEEKLY" ? "weekly" : type === "MONTHLY" ? "monthly" : "other";
  const end = typeof period?.end === "string" ? new Date(period.end) : null;
  const window: EngineUsageWindow = {
    id: "subscription",
    kind,
    label:
      kind === "weekly"
        ? "Weekly"
        : kind === "monthly"
          ? "Monthly"
          : "Subscription",
    usedPercent: clampUsagePercent(percent),
    ...(end && !Number.isNaN(end.getTime())
      ? { resetsAt: end.toISOString() }
      : {}),
  };
  return makeEngineUsageLimits({
    checkedAt: input.checkedAt,
    credentialFingerprint,
    windows: [window],
  });
}

/**
 * Reads the grok.com login's credits. Called by the usage store, which only
 * reads while the instance is usable; nothing is requested without a
 * grok.com login.
 */
export async function readGrokUsageLimits(
  input: { env: Record<string, string | undefined>; signal: AbortSignal },
  deps: GrokUsageDeps = {},
): Promise<EngineUsageLimits> {
  const checkedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const probeFailed = makeUnavailableEngineUsageLimits({
    checkedAt,
    message: "Grok could not read usage limits.",
    reason: "probeFailed",
  });

  let login: GrokLogin;
  try {
    login = await readGrokLogin(input.env, deps);
  } catch {
    return probeFailed;
  }
  if (login.status !== "signed-in") {
    return makeUnavailableEngineUsageLimits({
      checkedAt,
      reason: "unsupported",
    });
  }

  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(READ_TIMEOUT_MS),
  ]);
  try {
    const response = await (deps.fetch ?? fetch)(GROK_BILLING_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${login.token}`,
      },
      signal,
    });
    if (!response.ok) {
      return probeFailed;
    }
    return grokBillingToLimits((await response.json()) as GrokBillingResponse, {
      checkedAt,
      token: login.token,
    });
  } catch {
    return probeFailed;
  }
}

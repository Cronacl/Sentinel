import "server-only";

import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  ensureAuthBrowserCommand,
  type AuthBrowserCommand,
} from "@/lib/ai/chat/engines/platform/auth/browser-helper";
import { createLogger } from "@/lib/logger";

// The private profile and environment an Antigravity instance launches with
// (design acp-and-agents §3.3; ported from t3code
// apps/server/src/provider/antigravityAuthSupport.ts, MIT). Every instance
// gets its own GEMINI_HOME (its Google sign-in lives there, as a file:
// AGY_ACP_FORCE_FILE_STORAGE keeps it out of the OS keychain), a TMPDIR per
// process under the instance (the server unpacks ~1 GB per launch; it is
// removed when the process exits and swept when one was killed), BROWSER
// pointing at Sentinel's verified helper (critique G13), and only the
// configured auth method's
// credential. The environment is curated: the instance env minus every
// Google credential, profile and browser variable it might carry.

const log = createLogger("AntigravityProfile");

export const ANTIGRAVITY_AUTH_METHODS = [
  "oauth-personal",
  "oauth-business",
  "gemini-api-key",
  "agent-platform",
] as const;
export type AntigravityAuthMethod = (typeof ANTIGRAVITY_AUTH_METHODS)[number];

export function isAntigravityAuthMethod(
  value: unknown,
): value is AntigravityAuthMethod {
  return (
    typeof value === "string" &&
    (ANTIGRAVITY_AUTH_METHODS as readonly string[]).includes(value)
  );
}

/** The instance's sign-in settings; empty strings mean "not set". */
export type AntigravityAuthConfig = {
  apiKey: string;
  authMethod: AntigravityAuthMethod;
  gcpLocation: string;
  gcpProject: string;
};

export const GEMINI_API_KEY_VARIABLE = "GEMINI_API_KEY";
export const GOOGLE_API_KEY_VARIABLE = "GOOGLE_API_KEY";
export const GCP_PROJECT_VARIABLE = "GOOGLE_CLOUD_PROJECT";
export const GCP_LOCATION_VARIABLE = "GOOGLE_CLOUD_LOCATION";
const VERTEX_VARIABLE = "GOOGLE_GENAI_USE_VERTEXAI";

/** The env variables naming the temp directory. */
export function antigravityTempVariables(platform: NodeJS.Platform) {
  return platform === "win32" ? ["TEMP", "TMP"] : ["TMPDIR"];
}

/** Removed from the launch env (Windows keys compare case-insensitively). */
const REMOVED_ENV_KEYS = new Set([
  "AGY_ACP_CCPA_PROJECT",
  "AGY_ACP_ENABLE_OAUTH",
  "AGY_ACP_FORCE_FILE_STORAGE",
  "ANTIGRAVITY_HARNESS_PATH",
  "BROWSER",
  "CLOUDSDK_CORE_PROJECT",
  "ELECTRON_RUN_AS_NODE",
  "GCLOUD_PROJECT",
  "GEMINI_API_KEY",
  "GEMINI_HOME",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
  "GOOGLE_GENAI_USE_VERTEXAI",
  "PYTHONUNBUFFERED",
  "TEMP",
  "TMP",
  "TMPDIR",
]);

type AntigravityConfig = {
  authMethodId?: unknown;
  gcpLocation?: unknown;
  gcpProject?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The instance's auth settings: the method its last sign-in in Settings
 * used, else the configured one, else the personal Google account.
 * Credentials come from the instance's own (encrypted) variables, never the
 * server's env.
 */
export function readAntigravityAuthConfig(
  instance: Pick<ResolvedEngineInstance, "config" | "envOverrides">,
  storedMethod?: string | null,
): AntigravityAuthConfig {
  const config = instance.config as AntigravityConfig;
  const configured = text(config.authMethodId);
  const authMethod = isAntigravityAuthMethod(storedMethod)
    ? storedMethod
    : isAntigravityAuthMethod(configured)
      ? configured
      : "oauth-personal";
  const overrides = instance.envOverrides;
  return {
    apiKey:
      authMethod === "gemini-api-key"
        ? text(overrides[GEMINI_API_KEY_VARIABLE])
        : authMethod === "agent-platform"
          ? text(overrides[GOOGLE_API_KEY_VARIABLE])
          : "",
    authMethod,
    gcpLocation:
      text(config.gcpLocation) || text(overrides[GCP_LOCATION_VARIABLE]),
    gcpProject:
      text(config.gcpProject) || text(overrides[GCP_PROJECT_VARIABLE]),
  };
}

export function antigravityAuthUsesBrowser(method: AntigravityAuthMethod) {
  return method === "oauth-personal" || method === "oauth-business";
}

export function antigravityAuthLabel(method: AntigravityAuthMethod) {
  switch (method) {
    case "oauth-personal":
      return "Google account";
    case "oauth-business":
      return "Gemini Enterprise";
    case "gemini-api-key":
      return "Gemini API key";
    case "agent-platform":
      return "Agent Platform";
  }
}

/** What is missing before the method can sign in, else null. */
export function antigravityAuthConfigIssue(auth: AntigravityAuthConfig) {
  switch (auth.authMethod) {
    case "oauth-personal":
      return null;
    case "oauth-business":
      return auth.gcpProject && auth.gcpLocation
        ? null
        : "Gemini Enterprise needs a Google Cloud project and location.";
    case "gemini-api-key":
      return auth.apiKey ? null : "Antigravity needs a Gemini API key.";
    case "agent-platform":
      return auth.apiKey || (auth.gcpProject && auth.gcpLocation)
        ? null
        : "Agent Platform needs an API key, or a Google Cloud project and location.";
  }
}

/**
 * `antigravity-acp/settings.json`: `auth.type` names the method (so a
 * native logout clears only its credentials) and `gcp` feeds Enterprise and
 * Agent Platform. Never holds a credential.
 */
export function antigravityProfileSettings(auth: AntigravityAuthConfig) {
  const gcp = {
    ...(auth.gcpProject ? { project: auth.gcpProject } : {}),
    ...(auth.gcpLocation ? { location: auth.gcpLocation } : {}),
  };
  return `${JSON.stringify({
    auth: { type: auth.authMethod },
    ...(Object.keys(gcp).length > 0 ? { gcp } : {}),
  })}\n`;
}

/**
 * GEMINI_HOME: always Sentinel's private profile for the instance, never a
 * user-chosen home. Sentinel rewrites its settings.json, records sign-in
 * state in it and signs out through it, which must not touch ~/.gemini.
 */
export function getAntigravityProfileDirectory(
  instance: Pick<ResolvedEngineInstance, "stateDir">,
) {
  return path.join(instance.stateDir, "gemini-home");
}

/**
 * Parent of the per-process temp directories (the server unpacks ~1 GB into
 * TMPDIR per launch); see AcpLaunch.tempDirectory.
 */
export function getAntigravityTempDirectory(
  instance: Pick<ResolvedEngineInstance, "stateDir">,
) {
  return path.join(instance.stateDir, "tmp");
}

export type AntigravityProfile = {
  acpDirectory: string;
  browser: AuthBrowserCommand;
  geminiHome: string;
  tempDirectory: string;
};

const DIRECTORY_MODE = 0o700;

/** The two skill roots the server reads under GEMINI_HOME. */
export function antigravitySkillDirectories(geminiHome: string) {
  return [
    path.join(geminiHome, "config", "skills"),
    path.join(geminiHome, "antigravity-cli", "skills"),
  ] as const;
}

/**
 * Links the private profile's skill roots to the user's ~/.gemini ones so
 * global skills load while credentials, MCP servers and hooks stay
 * isolated. Best effort; a real directory at a link path is the user's and
 * is left alone.
 */
async function linkUserSkills(
  geminiHome: string,
  userHome: string,
  platform: NodeJS.Platform,
) {
  const userGemini = path.join(userHome, ".gemini");
  if (path.resolve(geminiHome) === path.resolve(userGemini)) {
    return;
  }
  const links = antigravitySkillDirectories(geminiHome);
  const targets = antigravitySkillDirectories(userGemini);
  for (const [index, link] of links.entries()) {
    const target = targets[index]!;
    try {
      const existing = await lstat(link).catch(() => null);
      if (existing && !existing.isSymbolicLink()) {
        continue;
      }
      if (existing) {
        const current = path.resolve(path.dirname(link), await readlink(link));
        if (current === target) {
          continue;
        }
        await rm(link, { force: true });
      }
      await mkdir(path.dirname(link), {
        mode: DIRECTORY_MODE,
        recursive: true,
      });
      await symlink(target, link, platform === "win32" ? "junction" : "dir");
    } catch (error) {
      log.debug("antigravity_skill_link_failed", { error, link });
    }
  }
}

/**
 * Creates the profile (0700), rewrites settings.json for the current auth
 * settings, links the user's skills and writes the BROWSER helper (the
 * launch verifies it). Reads no credential.
 */
export async function prepareAntigravityProfile(input: {
  auth: AntigravityAuthConfig;
  instance: Pick<ResolvedEngineInstance, "env" | "stateDir">;
  /** Windows' browser helper runtime (default: this process's). */
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
  /** Where `~` is for skills (default: the launch env's HOME). */
  userHome?: string;
}): Promise<AntigravityProfile> {
  const platform = input.platform ?? process.platform;
  const geminiHome = path.resolve(
    getAntigravityProfileDirectory(input.instance),
  );
  const acpDirectory = path.join(geminiHome, "antigravity-acp");
  const tempDirectory = getAntigravityTempDirectory(input.instance);
  for (const directory of [geminiHome, acpDirectory, tempDirectory]) {
    await mkdir(directory, { mode: DIRECTORY_MODE, recursive: true });
    if (platform !== "win32") {
      await chmod(directory, DIRECTORY_MODE);
    }
  }
  await writeFile(
    path.join(acpDirectory, "settings.json"),
    antigravityProfileSettings(input.auth),
    { encoding: "utf8", mode: 0o600 },
  );
  const userHome =
    input.userHome ??
    (platform === "win32"
      ? input.instance.env.USERPROFILE
      : input.instance.env.HOME) ??
    os.homedir();
  await linkUserSkills(geminiHome, userHome, platform);

  const browser = await ensureAuthBrowserCommand(
    path.join(input.instance.stateDir, "bin"),
    { nodeExecutable: input.nodeExecutable, platform },
  );
  return { acpDirectory, browser, geminiHome, tempDirectory };
}

/**
 * The curated launch environment: the instance env without Google
 * credential, profile or browser variables, then the profile's variables
 * and the configured method's credential only.
 */
export function buildAntigravityEnv(input: {
  auth: AntigravityAuthConfig;
  env: Record<string, string | undefined>;
  harnessPath: string;
  /** The instance's own variables (GOOGLE_GENAI_USE_VERTEXAI for Agent Platform). */
  overrides?: Record<string, string>;
  platform?: NodeJS.Platform;
  profile: AntigravityProfile;
}): Record<string, string | undefined> {
  const platform = input.platform ?? process.platform;
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input.env)) {
    if (!REMOVED_ENV_KEYS.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  // The server prefers GOOGLE_API_KEY over the GCP pair for Agent
  // Platform, so the pair goes through settings.json, not the env.
  const vertex = input.overrides?.[VERTEX_VARIABLE]?.trim();
  const credential: Record<string, string> =
    input.auth.authMethod === "gemini-api-key" && input.auth.apiKey
      ? { [GEMINI_API_KEY_VARIABLE]: input.auth.apiKey }
      : input.auth.authMethod === "agent-platform"
        ? {
            ...(input.auth.apiKey
              ? { [GOOGLE_API_KEY_VARIABLE]: input.auth.apiKey }
              : {}),
            ...(vertex ? { [VERTEX_VARIABLE]: vertex } : {}),
          }
        : {};
  const temp = input.profile.tempDirectory;
  return {
    ...env,
    ...credential,
    AGY_ACP_FORCE_FILE_STORAGE: "1",
    ANTIGRAVITY_HARNESS_PATH: input.harnessPath,
    ...input.profile.browser.env,
    BROWSER: input.profile.browser.browser,
    GEMINI_HOME: input.profile.geminiHome,
    PYTHONUNBUFFERED: "1",
    ...Object.fromEntries(
      antigravityTempVariables(platform).map((name) => [name, temp]),
    ),
  };
}

// What Sentinel knows about the profile's sign-in, next to it: the method
// the last sign-in used, and whether the agent asked for a new sign-in
// since. The server's own token file is only checked for existence.

const AUTH_STATE_FILE = "sentinel-auth.json";
const TOKEN_FILE = path.join("antigravity-acp", "acp_token.json");

export type AntigravityAuthState = {
  method: AntigravityAuthMethod | null;
  status: "signed-in" | "signed-out";
  updatedAt: string;
};

export async function readAntigravityAuthState(
  geminiHome: string,
): Promise<AntigravityAuthState | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(geminiHome, AUTH_STATE_FILE), "utf8"),
    ) as Partial<AntigravityAuthState>;
    return {
      method: isAntigravityAuthMethod(raw.method) ? raw.method : null,
      status: raw.status === "signed-out" ? "signed-out" : "signed-in",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export async function writeAntigravityAuthState(
  geminiHome: string,
  state: Pick<AntigravityAuthState, "method" | "status">,
) {
  await mkdir(geminiHome, { mode: DIRECTORY_MODE, recursive: true });
  await writeFile(
    path.join(geminiHome, AUTH_STATE_FILE),
    `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

/** The server stored a Google sign-in in the profile (existence only). */
export async function hasAntigravityToken(geminiHome: string) {
  const info = await stat(path.join(geminiHome, TOKEN_FILE)).catch(() => null);
  return Boolean(info?.isFile());
}

// Sign-in and sign-out from Settings run their own server on the profile.
// While one does, chat turns do not start another (it would begin a second
// Google request and share the token file).

const globalForAuth = globalThis as unknown as {
  __sentinelAntigravityAuthOperations?: Map<string, number>;
};

function authOperations() {
  globalForAuth.__sentinelAntigravityAuthOperations ??= new Map();
  return globalForAuth.__sentinelAntigravityAuthOperations;
}

/** Marks a Settings sign-in or sign-out as running; call the result when it ends. */
export function beginAntigravityAuthOperation(instanceId: string) {
  const operations = authOperations();
  operations.set(instanceId, (operations.get(instanceId) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const count = (operations.get(instanceId) ?? 1) - 1;
    if (count > 0) operations.set(instanceId, count);
    else operations.delete(instanceId);
  };
}

export function isAntigravityAuthOperationActive(instanceId: string) {
  return authOperations().has(instanceId);
}

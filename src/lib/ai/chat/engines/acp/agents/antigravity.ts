import "server-only";

import path from "node:path";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { verifyAuthBrowserCommand } from "@/lib/ai/chat/engines/platform/auth/browser-helper";
import { BUNDLED_ENGINE_MANIFEST } from "@/lib/ai/chat/engines/platform/manifest/bundled";

import {
  ANTIGRAVITY_SIGN_IN_REQUIRED_MESSAGE,
  captureAntigravityAuthLine,
  onAntigravityAuthRequest,
} from "../antigravity/auth-url";
import { resolveAntigravityBinary } from "../antigravity/install";
import {
  antigravityAuthConfigIssue,
  antigravityAuthLabel,
  antigravityTempVariables,
  antigravityAuthUsesBrowser,
  buildAntigravityEnv,
  getAntigravityProfileDirectory,
  hasAntigravityToken,
  isAntigravityAuthOperationActive,
  prepareAntigravityProfile,
  readAntigravityAuthConfig,
  readAntigravityAuthState,
  writeAntigravityAuthState,
  type AntigravityAuthConfig,
} from "../antigravity/profile";
import {
  antigravityPermissionModeId,
  antigravityToolKind,
  handleAntigravityPermissionRequest,
  normalizeAntigravityInbound,
  resolveAntigravityModelSelection,
} from "../antigravity/protocol";
import { antigravityFileNames } from "../antigravity/release";
import type { AcpAgentProcess } from "../connection";
import type {
  AcpAgentDescriptor,
  AcpResolvedBinary,
  AcpStaticProbe,
} from "../descriptor";
import { AcpAuthRequiredError } from "../errors";
import {
  getAcpProcessLaunch,
  sweepAcpTempDirectories,
  type AcpLaunch,
} from "../launch";

// Google Antigravity on the shared ACP engine (design acp-and-agents §3.3;
// behaviour from t3code apps/server/src/provider/{Drivers/AntigravityDriver,
// acp/AntigravityAcpSupport}.ts and orchestration-v2/Adapters/
// AntigravityAdapterV2.ts, MIT). What differs from other ACP agents:
// - the server is Google's agy-acp-server (Sentinel installs it), launched
//   with no arguments (`--uid=` on Linux) and a curated environment around
//   a private GEMINI_HOME per instance (antigravity/profile.ts);
// - it answers initialize with protocolVersion 2 and a v1 body;
// - sign-in is eager (`authenticate` before the session) with the
//   instance's method; a Google sign-in it starts inside a chat run ends the
//   turn with "sign in from Settings" (the auth flow runs it there);
// - status probes never spawn it (it unpacks ~1 GB per launch): they read
//   the version and sign-in from disk;
// - sessions prefer session/resume (load replays every tool call); the
//   permission mode is the session mode; plan mode is hidden;
// - the client fs is served in chat sessions so edits come back as
//   approvals; `interaction_` approvals are questions; start_subagent calls
//   are subagent cards.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_NATIVE_BYTES = 50 * 1024 * 1024;

/** The model the default selection picks when the account offers it. */
export function antigravityManifestDefaultModel() {
  return BUNDLED_ENGINE_MANIFEST.drivers.antigravity?.defaults?.chat ?? null;
}

/** The instance's auth settings, with the method its last sign-in used. */
export async function readAntigravityInstanceAuth(
  instance: ResolvedEngineInstance,
): Promise<AntigravityAuthConfig> {
  const state = await readAntigravityAuthState(
    getAntigravityProfileDirectory(instance),
  );
  return readAntigravityAuthConfig(instance, state?.method ?? null);
}

/** Marks the profile signed out (the agent asked for a new sign-in). */
async function markSignedOut(process: AcpAgentProcess, method: string) {
  const geminiHome = getAcpProcessLaunch(process)?.env.GEMINI_HOME;
  if (geminiHome) {
    await writeAntigravityAuthState(geminiHome, {
      method: method as AntigravityAuthConfig["authMethod"],
      status: "signed-out",
    }).catch(() => undefined);
  }
}

async function readStatic(
  instance: ResolvedEngineInstance,
): Promise<AcpStaticProbe> {
  const geminiHome = getAntigravityProfileDirectory(instance);
  const state = await readAntigravityAuthState(geminiHome);
  const auth = readAntigravityAuthConfig(instance, state?.method ?? null);
  const method = antigravityAuthLabel(auth.authMethod);
  const base = { imagePrompts: true, resumable: true };
  const issue = antigravityAuthConfigIssue(auth);
  if (issue) {
    return {
      ...base,
      auth: { method, status: "unauthenticated" },
      message: `${issue} Add it in Settings > Engines > Antigravity.`,
    };
  }
  const signedIn =
    state?.status === "signed-in" ||
    (state?.status !== "signed-out" &&
      (!antigravityAuthUsesBrowser(auth.authMethod) ||
        (await hasAntigravityToken(geminiHome))));
  return signedIn
    ? { ...base, auth: { method, status: "authenticated" } }
    : {
        ...base,
        auth: { method, status: "unauthenticated" },
        message: antigravityAuthUsesBrowser(auth.authMethod)
          ? "Sign in with Google to use Antigravity."
          : "Antigravity needs you to sign in again.",
      };
}

/**
 * The server's launch for `auth`: no arguments (`--uid=` on Linux), the
 * prepared profile and the curated environment.
 */
export async function buildAntigravityLaunch(input: {
  auth: AntigravityAuthConfig;
  binary: AcpResolvedBinary;
  cwd: string;
  instance: ResolvedEngineInstance;
}): Promise<AcpLaunch> {
  const { auth, binary, instance } = input;
  const profile = await prepareAntigravityProfile({ auth, instance });
  // Unpacks of servers that were killed (or outlived an earlier Sentinel).
  void sweepAcpTempDirectories(profile.tempDirectory);
  const env = buildAntigravityEnv({
    auth,
    env: { ...instance.env, PATH: binary.env.PATH ?? instance.env.PATH },
    harnessPath: path.join(
      path.dirname(binary.path),
      antigravityFileNames().harness,
    ),
    overrides: instance.envOverrides,
    profile,
  });
  // A helper that fails makes Python's webbrowser open the system browser:
  // the server does not start unless it works under this env.
  await verifyAuthBrowserCommand(profile.browser, env);
  return {
    args: [
      ...(process.platform === "linux" ? ["--uid="] : []),
      ...(instance.config.launchArgs ?? []),
    ],
    command: binary.path,
    cwd: input.cwd,
    env,
    tempDirectory: {
      root: profile.tempDirectory,
      variables: antigravityTempVariables(process.platform),
    },
  };
}

export const antigravityAcpAgent: AcpAgentDescriptor = {
  acceptedProtocolVersions: [2],
  auth: {
    // Chat runs never complete a browser sign-in: the moment the agent
    // starts one, the turn ends and points at Settings, and the process
    // (blocked in its own authenticate) is dropped.
    async authenticate(process, method, options) {
      let unsubscribe = () => {};
      const signInStarted = new Promise<never>((_, reject) => {
        unsubscribe = onAntigravityAuthRequest(process, () => {
          void markSignedOut(process, method.id).then(() => {
            // Rejected before the process ends, so the turn reports this
            // instead of the exit.
            reject(
              new AcpAuthRequiredError(ANTIGRAVITY_SIGN_IN_REQUIRED_MESSAGE),
            );
            void process.dispose();
          });
        });
      });
      try {
        await Promise.race([
          process.request(
            process.methods.authenticate,
            { methodId: method.id },
            { signal: options.signal, timeoutMs: options.timeoutMs },
          ),
          signInStarted,
        ]);
      } finally {
        unsubscribe();
      }
    },
    loginHint: () => "Settings > Engines > Antigravity > Sign in",
    // Replaced per instance (antigravityAcpAgentFor): the configured method.
    methodId: (methods) =>
      methods.find((method) => method.id === "oauth-personal")?.id ?? null,
    strategy: "eager",
    timeoutMs: 60_000,
  },
  cancelGraceMs: 15_000,
  clientFs: true,
  clientTerminals: false,
  driver: "antigravity",
  handlePermissionRequest: handleAntigravityPermissionRequest,
  id: "antigravity",
  label: "Antigravity",
  launchArgs: [],
  normalizeInbound: normalizeAntigravityInbound,
  onStderrLine: (line, process) => captureAntigravityAuthLine(process, line),
  onStdoutNoise: (line, process) => captureAntigravityAuthLine(process, line),
  permissionModeId: antigravityPermissionModeId,
  permissionModes: DRIVER_CATALOG.antigravity.capabilities.permissionModes,
  planMode: "hidden",
  async prepareLaunch({ binary, cwd, instance, purpose }) {
    const auth = await readAntigravityInstanceAuth(instance);
    if (purpose === "session") {
      if (isAntigravityAuthOperationActive(instance.id)) {
        throw new AcpAuthRequiredError(
          "Antigravity is signing in or out in Settings. Retry once that finishes.",
        );
      }
      const issue = antigravityAuthConfigIssue(auth);
      if (issue) {
        throw new AcpAuthRequiredError(
          `${issue} Add it in Settings > Engines > Antigravity.`,
        );
      }
    }
    return await buildAntigravityLaunch({ auth, binary, cwd, instance });
  },
  probe: {
    mode: "static",
    readStatic: (instance) => readStatic(instance),
    timeoutMs: 5_000,
  },
  processLabel: "Antigravity",
  promptAttachments: {
    audio: true,
    imageMimeTypes: ["image/bmp", "image/jpeg", "image/png", "image/webp"],
    maxAudioBytes: MAX_AUDIO_BYTES,
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTextBytes: MAX_TEXT_BYTES,
    maxTotalBytes: MAX_NATIVE_BYTES,
    pdfAsLink: true,
  },
  resolveBinary: (instance) => resolveAntigravityBinary(instance),
  resolveModelSelection: (selection, session) =>
    resolveAntigravityModelSelection(
      selection,
      session,
      antigravityManifestDefaultModel(),
    ),
  session: { prefer: "resume" },
  toolKind: antigravityToolKind,
  toolPrefix: "antigravity_",
};

/** The descriptor for one instance: it signs in with the instance's method. */
export async function antigravityAcpAgentFor(
  instance: ResolvedEngineInstance,
): Promise<AcpAgentDescriptor> {
  const { authMethod } = await readAntigravityInstanceAuth(instance);
  return {
    ...antigravityAcpAgent,
    auth: {
      ...antigravityAcpAgent.auth,
      methodId: (methods) =>
        methods.some((method) => method.id === authMethod) ? authMethod : null,
    },
  };
}

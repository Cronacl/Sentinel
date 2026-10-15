import "server-only";

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import type {
  EngineAuthCredentialField,
  EngineAuthMethod,
  ResolvedEngineInstance,
} from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
  type EngineAuthFlowContext,
} from "../../platform/auth/controller";

// Antigravity signs in through its own ACP `authenticate` (design
// acp-and-agents §3.3; flow from t3code apps/server/src/provider/
// AntigravityAuth.ts, MIT): Sentinel starts the instance's server with its
// private profile, asks for the method, and for Google sign-ins shows the
// authorization URL the server prints (validated: Google's endpoint, one
// loopback redirect). Opening it locally completes on the server's own
// loopback listener; from another computer the user pastes the redirect
// address, which is validated against the pending request and replayed to
// that listener. API keys are stored only once the server accepted them.
// Sign-out uses the server's `logout` and drops the instance's keys.

const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
const START_TIMEOUT_MS = 120_000;
const LOGOUT_TIMEOUT_MS = 90_000;

// The engine modules load on first use: this module adds nothing to what
// the driver itself imports.
async function engine() {
  const [agent, authUrl, install, launch, profile, session, errors] =
    await Promise.all([
      import("../../acp/agents/antigravity"),
      import("../../acp/antigravity/auth-url"),
      import("../../acp/antigravity/install"),
      import("../../acp/launch"),
      import("../../acp/antigravity/profile"),
      import("../../acp/session"),
      import("../../acp/errors"),
    ]);
  return { agent, authUrl, errors, install, launch, profile, session };
}

type Engine = Awaited<ReturnType<typeof engine>>;

const METHODS: Array<EngineAuthMethod & { id: string }> = [
  {
    description:
      "Opens Google's sign-in page. From another computer, paste the address it sends you to.",
    id: "oauth-personal",
    label: "Sign in with Google",
    type: "browser",
  },
  {
    description:
      "Google sign-in for Gemini Enterprise; needs a Google Cloud project and location.",
    id: "oauth-business",
    label: "Gemini Enterprise",
    type: "browser",
  },
  {
    description: "Stored encrypted as GEMINI_API_KEY for this instance.",
    id: "gemini-api-key",
    label: "Use a Gemini API key",
    type: "credentials",
  },
  {
    description:
      "A Google Cloud API key for Agent Platform, stored encrypted as GOOGLE_API_KEY.",
    id: "agent-platform",
    label: "Agent Platform API key",
    type: "credentials",
  },
];

/** The credentials a method needs that the instance does not have yet. */
function missingFields(
  e: Engine,
  method: string,
  auth: ReturnType<Engine["profile"]["readAntigravityAuthConfig"]>,
): EngineAuthCredentialField[] {
  const { profile } = e;
  if (method === "gemini-api-key") {
    return [
      {
        label: "Gemini API key",
        name: profile.GEMINI_API_KEY_VARIABLE,
        secret: true,
      },
    ];
  }
  if (method === "agent-platform") {
    return [
      {
        label: "Google Cloud API key",
        name: profile.GOOGLE_API_KEY_VARIABLE,
        secret: true,
      },
    ];
  }
  if (method === "oauth-business" && !(auth.gcpProject && auth.gcpLocation)) {
    return [
      {
        label: "Google Cloud project",
        name: profile.GCP_PROJECT_VARIABLE,
        secret: false,
      },
      {
        label: "Google Cloud location",
        name: profile.GCP_LOCATION_VARIABLE,
        secret: false,
      },
    ];
  }
  return [];
}

/** Starts the instance's server for a sign-in step (no client fs, no session). */
async function startServer(
  e: Engine,
  instance: ResolvedEngineInstance,
  context: EngineAuthFlowContext,
  auth: ReturnType<Engine["profile"]["readAntigravityAuthConfig"]>,
) {
  const { error, installation } =
    await e.install.resolveAntigravityInstallation(instance);
  if (!installation) {
    throw new EngineAuthError(error ?? "Antigravity is not installed.");
  }
  // Running sessions share the profile: they end first.
  await e.launch.disposeAcpInstanceProcesses(instance.id);
  await mkdir(instance.stateDir, { mode: 0o700, recursive: true });
  const cwd = await mkdtemp(path.join(instance.stateDir, "auth-"));
  const descriptor = e.agent.antigravityAcpAgent;
  const launch = await e.agent.buildAntigravityLaunch({
    auth,
    binary: {
      env: instance.env,
      path: installation.executablePath,
      source: installation.source,
      version: installation.version,
    },
    cwd,
    instance,
  });
  const process = e.launch.startAcpProcess(descriptor, launch, {
    instanceId: instance.id,
  });
  const stop = () => void process.dispose();
  context.signal.addEventListener("abort", stop, { once: true });
  const dispose = async () => {
    context.signal.removeEventListener("abort", stop);
    await process.dispose();
    await rm(cwd, { force: true, recursive: true }).catch(() => undefined);
  };
  try {
    context.setMessage("Starting Antigravity.");
    const init = await e.session.initializeAcpAgent(process, {
      context: "probe",
      descriptor,
      signal: context.signal,
      timeoutMs: START_TIMEOUT_MS,
    });
    return { dispose, geminiHome: launch.env.GEMINI_HOME!, init, process };
  } catch (startError) {
    await dispose();
    throw new EngineAuthError(
      `Antigravity did not start: ${e.errors.getErrorMessage(startError)}`,
    );
  }
}

/** Shows the server's Google sign-in URL, with the paste-back of its redirect. */
function showGoogleSignIn(
  e: Engine,
  context: EngineAuthFlowContext,
  request: Parameters<
    Engine["authUrl"]["validateAntigravityCallbackUrl"]
  >[0] & { authorizationUrl: string },
) {
  context.showBrowser(request.authorizationUrl, {
    async onCallback(callbackUrl) {
      try {
        const callback = e.authUrl.validateAntigravityCallbackUrl(
          request,
          callbackUrl,
        );
        await e.authUrl.forwardAntigravityCallback(callback);
      } catch (error) {
        throw new EngineAuthError(
          error instanceof Error
            ? error.message
            : "That address could not be used.",
        );
      }
    },
  });
}

export const antigravityAuth: EngineAuthController = {
  async methods(instance) {
    const { resolveAntigravityInstallation } =
      await import("../../acp/antigravity/install");
    const { installation } = await resolveAntigravityInstallation(instance);
    return installation ? METHODS : [];
  },

  async login(instance, methodId, context) {
    const e = await engine();
    if (!e.profile.isAntigravityAuthMethod(methodId)) {
      throw new EngineAuthError("Antigravity does not offer that sign-in.");
    }
    const label = e.profile.antigravityAuthLabel(methodId);
    const current = e.profile.readAntigravityAuthConfig(instance, methodId);
    const fields = missingFields(e, methodId, current);
    const entered = fields.length
      ? await context.requestCredentials(fields)
      : {};
    // The server signs in with the entered values; they are stored once it
    // accepted them.
    const overrides = { ...instance.envOverrides, ...entered };
    const working: ResolvedEngineInstance = {
      ...instance,
      env: { ...instance.env, ...entered },
      envOverrides: overrides,
    };
    const server = await startServer(
      e,
      working,
      context,
      e.profile.readAntigravityAuthConfig(working, methodId),
    );
    let unsubscribe = () => {};
    try {
      if (!server.init.authMethods.some((method) => method.id === methodId)) {
        throw new EngineAuthError(
          `This Antigravity version does not offer ${label}. Update it.`,
        );
      }
      if (e.profile.antigravityAuthUsesBrowser(methodId)) {
        let shown: string | null = null;
        unsubscribe = e.authUrl.onAntigravityAuthRequest(
          server.process,
          (request) => {
            if (shown) return;
            shown = request.authorizationUrl;
            showGoogleSignIn(e, context, request);
          },
        );
        context.setMessage("Waiting for Google's sign-in page.");
      } else {
        context.setMessage(`Checking the ${label}.`);
      }
      try {
        await server.process.request(
          server.process.methods.authenticate,
          { methodId },
          { signal: context.signal, timeoutMs: SIGN_IN_TIMEOUT_MS },
        );
      } catch (error) {
        if (context.signal.aborted) throw error;
        throw new EngineAuthError(
          `Antigravity sign-in did not complete: ${e.errors.getErrorMessage(error)}`,
        );
      }
      if (Object.keys(entered).length > 0) {
        await context.saveInstanceSecrets(entered);
      }
      await e.profile.writeAntigravityAuthState(server.geminiHome, {
        method: methodId,
        status: "signed-in",
      });
      return {
        message: e.profile.antigravityAuthUsesBrowser(methodId)
          ? `Signed in with ${label}.`
          : `Antigravity accepted the ${label}.`,
      };
    } finally {
      unsubscribe();
      await server.dispose();
    }
  },

  async logout(instance, context) {
    const e = await engine();
    const geminiHome = e.profile.getAntigravityProfileDirectory(instance);
    const state = await e.profile.readAntigravityAuthState(geminiHome);
    const cleared = await context.clearInstanceSecrets([
      e.profile.GEMINI_API_KEY_VARIABLE,
      e.profile.GOOGLE_API_KEY_VARIABLE,
    ]);
    const { installation } =
      await e.install.resolveAntigravityInstallation(instance);
    if (installation) {
      const server = await startServer(
        e,
        instance,
        context,
        e.profile.readAntigravityAuthConfig(instance, state?.method ?? null),
      );
      try {
        if (e.install.supportsAntigravityLogout(server.init.raw)) {
          context.setMessage("Signing out of Antigravity.");
          await server.process.request(
            "logout",
            {},
            { signal: context.signal, timeoutMs: LOGOUT_TIMEOUT_MS },
          );
        } else if (cleared.length === 0) {
          throw new EngineAuthError(
            "This Antigravity version cannot sign out. Update it.",
          );
        }
      } catch (error) {
        if (error instanceof EngineAuthError || context.signal.aborted) {
          throw error;
        }
        throw new EngineAuthError(
          `Antigravity did not sign out: ${e.errors.getErrorMessage(error)}`,
        );
      } finally {
        await server.dispose();
      }
    } else if (cleared.length === 0) {
      throw new EngineAuthError(
        "Antigravity is not installed, so Sentinel cannot sign it out.",
      );
    }
    await e.profile.writeAntigravityAuthState(geminiHome, {
      method: state?.method ?? null,
      status: "signed-out",
    });
    return {
      message:
        cleared.length > 0
          ? "Signed out and removed this instance's API key."
          : "Signed out of Antigravity.",
    };
  },

  // Each instance has its own profile: signing out affects only it.
  logoutNotice: () => null,
};

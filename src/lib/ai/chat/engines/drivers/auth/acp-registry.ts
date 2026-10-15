import "server-only";

import path from "node:path";

import type { EngineAuthMethod, ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
  type EngineAuthFlowContext,
} from "../../platform/auth/controller";
import { toAuthTerminalInvocation } from "../../platform/auth/terminal-command";

// Registry agents sign in with whatever their `initialize` advertised (the
// last full probe recorded it; t3code AcpRegistryAuth.ts, MIT):
// - agent: ACP `authenticate(methodId)` in a short-lived agent process (a
//   URL elicitation it sends meanwhile opens as a browser page);
// - env_var: the variables are stored as the instance's (encrypted)
//   secrets; the method id is never sent;
// - terminal: the agent's own command plus the method's arguments and
//   variables, in the embedded terminal (offered only where one exists).
// The flow store then refreshes the snapshot, whose full probe opens a
// session and so tells whether the sign-in worked.

const LOGIN_TIMEOUT_MS = 5 * 60 * 1_000;

async function loadEngine() {
  const [registry, launch, session, probeInfo, elicitation] = await Promise.all(
    [
      import("@/lib/ai/chat/engines/acp/agents/registry"),
      import("@/lib/ai/chat/engines/acp/launch"),
      import("@/lib/ai/chat/engines/acp/session"),
      import("@/lib/ai/chat/engines/acp/registry/probe-info"),
      import("@/lib/ai/chat/runtime/external/elicitation"),
    ],
  );
  return { elicitation, launch, probeInfo, registry, session };
}

async function resolveLaunch(instance: ResolvedEngineInstance) {
  const engine = await loadEngine();
  const descriptor = engine.registry.getAcpRegistryDescriptor(instance);
  const { binary, error } = await descriptor.resolveBinary(instance);
  if (!binary) {
    throw new EngineAuthError(error ?? `${descriptor.label} was not found.`);
  }
  const launch = engine.launch.buildAcpLaunch(
    descriptor,
    instance,
    binary,
    path.join(instance.stateDir, "probe-cwd"),
  );
  return { binary, descriptor, engine, launch };
}

/** Runs `work` against a fresh, initialized agent process. */
async function withAgent<T>(
  instance: ResolvedEngineInstance,
  context: EngineAuthFlowContext,
  work: (
    process: import("@/lib/ai/chat/engines/acp/connection").AcpAgentProcess,
    resolved: Awaited<ReturnType<typeof resolveLaunch>>,
  ) => Promise<T>,
) {
  const resolved = await resolveLaunch(instance);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(resolved.launch.cwd, { mode: 0o700, recursive: true }).catch(
    () => undefined,
  );
  const process = resolved.engine.launch.startAcpProcess(
    resolved.descriptor,
    resolved.launch,
    { instanceId: instance.id },
  );
  const detach = process.attach({
    async onRequest(method, params) {
      if (method === process.methods.elicitationCreate) {
        const record = (params ?? {}) as Record<string, unknown>;
        const url = typeof record.url === "string" ? record.url : null;
        if (
          record.mode === "url" &&
          url &&
          resolved.engine.elicitation.isOpenableElicitationUrl(url)
        ) {
          context.showBrowser(url);
          return { action: "accept" };
        }
        return { action: "cancel" };
      }
      if (method === process.methods.requestPermission) {
        return { outcome: { outcome: "cancelled" } };
      }
      throw new Error(`${method} is not available while signing in.`);
    },
  });
  const stop = () => void process.dispose();
  context.signal.addEventListener("abort", stop, { once: true });
  try {
    await resolved.engine.session.initializeAcpAgent(process, {
      context: "session",
      descriptor: resolved.descriptor,
      signal: context.signal,
    });
    return await work(process, resolved);
  } finally {
    context.signal.removeEventListener("abort", stop);
    detach();
    await process.dispose();
  }
}

async function readMethods(instance: ResolvedEngineInstance) {
  const { readAcpRegistryProbeInfo } =
    await import("@/lib/ai/chat/engines/acp/registry/probe-info");
  return (await readAcpRegistryProbeInfo(instance.stateDir)) ?? null;
}

function stringEnv(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export const acpRegistryAuth: EngineAuthController = {
  async methods(instance, client) {
    const info = await readMethods(instance);
    return (info?.authMethods ?? []).flatMap((method): EngineAuthMethod[] => {
      const description = method.description ?? undefined;
      switch (method.kind) {
        case "agent":
          return [
            {
              ...(description ? { description } : {}),
              id: method.id,
              label: method.name,
              type: "agent",
            },
          ];
        case "env_var":
          return [
            {
              description:
                description ??
                `Stored encrypted as ${method.vars.map((variable) => variable.name).join(", ") || "instance variables"} for this instance.`,
              id: method.id,
              label: method.name,
              type: "credentials",
            },
          ];
        case "terminal":
          // Needs the embedded terminal: the command carries the agent's
          // own launch, which a copied command line would not reproduce.
          return client.terminal
            ? [
                {
                  ...(description ? { description } : {}),
                  id: method.id,
                  label: method.name,
                  type: "terminal-command",
                },
              ]
            : [];
      }
    });
  },

  async login(instance, methodId, context) {
    const info = await readMethods(instance);
    const method = info?.authMethods.find((entry) => entry.id === methodId);
    if (!method) {
      throw new EngineAuthError(
        "That sign-in method is no longer offered. Refresh the instance and try again.",
      );
    }

    if (method.kind === "env_var") {
      if (method.vars.length === 0) {
        throw new EngineAuthError(`${method.name} names no variables to set.`);
      }
      const values = await context.requestCredentials(
        method.vars.map((variable) => ({
          label: variable.label ?? variable.name,
          name: variable.name,
          secret: true,
        })),
        {
          ...(method.description || method.link
            ? {
                description: [method.description, method.link]
                  .filter(Boolean)
                  .join(" "),
              }
            : {}),
        },
      );
      const missing = method.vars.filter(
        (variable) => !variable.optional && !values[variable.name],
      );
      if (missing.length > 0) {
        throw new EngineAuthError(
          `${missing.map((variable) => variable.name).join(", ")} is required.`,
        );
      }
      await context.saveInstanceSecrets(
        Object.fromEntries(
          Object.entries(values).filter(([, value]) => Boolean(value)),
        ),
      );
      return;
    }

    if (method.kind === "terminal") {
      const { binary, descriptor, launch } = await resolveLaunch(instance);
      const args = [...launch.args, ...method.args];
      const invocation = toAuthTerminalInvocation(launch.command, args);
      const { exitCode } = await context.runTerminalCommand({
        ...invocation,
        display: { args: method.args, command: binary.path },
        env: {
          ...stringEnv(binary.launch?.env ?? {}),
          ...method.env,
          ...(launch.env.PATH ? { PATH: launch.env.PATH } : {}),
        },
        title: `${descriptor.label} sign-in`,
      });
      if (exitCode !== null && exitCode !== 0) {
        throw new EngineAuthError(
          `The sign-in command exited with code ${exitCode}.`,
        );
      }
      return;
    }

    await withAgent(instance, context, async (process, { descriptor }) => {
      context.setMessage(`Signing in to ${descriptor.label}…`);
      try {
        await process.request(
          process.methods.authenticate,
          { methodId: method.id },
          { signal: context.signal, timeoutMs: LOGIN_TIMEOUT_MS },
        );
      } catch (error) {
        if (context.signal.aborted) {
          throw error;
        }
        throw new EngineAuthError(
          `${descriptor.label} sign-in did not complete: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },

  async logout(instance, context) {
    const info = await readMethods(instance);
    const names = [
      ...new Set(
        (info?.authMethods ?? []).flatMap((method) =>
          method.kind === "env_var"
            ? method.vars.map((variable) => variable.name)
            : [],
        ),
      ),
    ];
    const cleared =
      names.length > 0 ? await context.clearInstanceSecrets(names) : [];
    if (info?.canLogout) {
      await withAgent(instance, context, async (process) => {
        await process.request(
          process.methods.logout,
          {},
          { signal: context.signal, timeoutMs: 30_000 },
        );
      });
      return;
    }
    if (cleared.length === 0) {
      throw new EngineAuthError(
        "This agent cannot sign out from Sentinel. Sign out with the agent itself.",
      );
    }
    return { message: "Removed this instance's credentials." };
  },
};

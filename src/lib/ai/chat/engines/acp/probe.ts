import "server-only";

import { mkdir } from "node:fs/promises";
import path from "node:path";

import type {
  EngineAuthSummary,
  EngineProbeResult,
  ResolvedEngineInstance,
} from "@/lib/ai/chat/engines/contract";
import type { ProbeOptions } from "@/lib/ai/chat/engines/platform/driver";

import { carryForwardLegacyProbe } from "../drivers/legacy-status";
import {
  mergeCatalogModels,
  readAcpCatalog,
  updateAcpCatalog,
  type AcpCatalog,
} from "./catalog-cache";
import { toAcpEngineModels, type AcpCatalogModel } from "./config-options";
import type { AcpAgentDescriptor } from "./descriptor";
import { getErrorMessage, isAuthRequiredError } from "./errors";
import { buildAcpLaunch, startAcpProcess } from "./launch";
import { initializeAcpAgent, type AcpInitializeInfo } from "./session";

// Status for ACP agents, per the driver contract's probe depths (design
// §2.17, critique §1 #1 and #16):
// - cheap: resolve the binary (and its version) and carry the last full
//   result forward while the binary is unchanged; nothing is spawned;
// - full: spawn the agent in a scratch directory under the instance's state
//   dir (never the server's cwd), `initialize` without a session (auth
//   methods, capabilities, agent info), and the descriptor's model list when
//   it has one (Cursor: cursor/list_available_models, which also tells
//   whether the user is signed in). Never authenticates, never creates a
//   session, and kills the agent on abort or when done.
// Models and slash commands otherwise come from what runs learned
// (catalog-cache.ts). A probe never throws.

export type AcpProbeDeps = {
  clientVersion?: string | null;
  start?: typeof startAcpProcess;
};

const UNKNOWN_AUTH: EngineAuthSummary = {
  canLogin: false,
  canLogout: false,
  email: null,
  label: null,
  method: null,
  plan: null,
  status: "unknown",
};

function withCatalog(
  result: EngineProbeResult,
  catalog: AcpCatalog | null,
  imageInput: boolean,
): EngineProbeResult {
  if (!catalog) {
    return result;
  }
  const models =
    catalog.models.length > 0
      ? toAcpEngineModels(catalog.models, { imageInput })
      : result.models;
  return {
    ...result,
    defaultModelId:
      catalog.models.find((model) => model.isDefault)?.id ??
      result.defaultModelId ??
      null,
    models,
    slashCommands: catalog.commands.map((command) => ({
      ...(command.description ? { description: command.description } : {}),
      ...(command.inputHint ? { inputHint: command.inputHint } : {}),
      name: command.name,
      source: "native" as const,
    })),
  };
}

function capabilityOverrides(init: AcpInitializeInfo) {
  return {
    supportsImages: init.capabilities.imagePrompts,
    supportsResume:
      init.capabilities.loadSession || init.capabilities.resumeSession
        ? ("native" as const)
        : ("replay" as const),
  };
}

export async function probeAcpAgent(
  descriptor: AcpAgentDescriptor,
  instance: ResolvedEngineInstance,
  options: ProbeOptions,
  deps: AcpProbeDeps = {},
): Promise<EngineProbeResult> {
  let resolution;
  try {
    resolution = await descriptor.resolveBinary(instance, {
      forceRefresh: options.forceRefresh,
    });
  } catch (error) {
    resolution = { binary: null, error: getErrorMessage(error) };
  }

  const catalog = await readAcpCatalog(instance.stateDir);
  const binary = resolution.binary;
  if (!binary) {
    return {
      auth: UNKNOWN_AUTH,
      install: { installed: false, path: null, source: null, version: null },
      message:
        resolution.error ?? `${descriptor.processLabel} was not found in PATH.`,
      models: [],
      status: "error",
    };
  }

  const install = {
    installed: true,
    path: binary.path,
    source: binary.source,
    version: binary.version,
  };
  const previousImages =
    options.previous?.capabilityOverrides?.supportsImages ?? false;

  if (options.depth === "cheap") {
    const carried = carryForwardLegacyProbe(options.previous, install);
    if (carried) {
      return withCatalog(carried, catalog, previousImages);
    }
  }

  if (options.signal.aborted) {
    return {
      auth: UNKNOWN_AUTH,
      install,
      message: `${descriptor.processLabel} status check was cancelled.`,
      models: [],
      status: "error",
    };
  }

  const cwd = path.join(instance.stateDir, "probe-cwd");
  await mkdir(cwd, { mode: 0o700, recursive: true }).catch(() => undefined);
  const process = (deps.start ?? startAcpProcess)(
    descriptor,
    buildAcpLaunch(descriptor, instance, binary, cwd),
    { instanceId: instance.id },
  );
  const stop = () => void process.dispose();
  options.signal.addEventListener("abort", stop, { once: true });

  try {
    const init = await initializeAcpAgent(process, {
      clientVersion: deps.clientVersion,
      context: "probe",
      descriptor,
      timeoutMs: descriptor.probe.timeoutMs,
    });
    let models: AcpCatalogModel[] = catalog?.models ?? [];
    let authStatus: EngineAuthSummary["status"] = "unknown";
    let message: string | undefined;

    if (descriptor.probe.listModels) {
      try {
        const listed = await descriptor.probe.listModels(process, {
          timeoutMs: descriptor.probe.timeoutMs,
        });
        authStatus = "authenticated";
        if (listed && listed.length > 0) {
          models = mergeCatalogModels(models, listed);
          await updateAcpCatalog(instance.stateDir, { models }).catch(
            () => undefined,
          );
        }
      } catch (error) {
        if (isAuthRequiredError(error)) {
          authStatus = "unauthenticated";
          const hint = descriptor.auth.loginHint?.(binary.path);
          message = `${descriptor.label} is signed out.${hint ? ` ${hint}` : ""}`;
        } else {
          message = `${descriptor.label} did not list its models: ${getErrorMessage(error)}`;
        }
      }
    }

    if (models.length === 0 && descriptor.fallbackModels) {
      models = [...descriptor.fallbackModels];
    }
    const preferredMethodId = descriptor.auth.methodId(init.authMethods);
    const result: EngineProbeResult = {
      auth: {
        ...UNKNOWN_AUTH,
        method:
          init.authMethods.find((method) => method.id === preferredMethodId)
            ?.name ?? null,
        status: authStatus,
      },
      capabilityOverrides: capabilityOverrides(init),
      defaultModelId: models.find((model) => model.isDefault)?.id ?? null,
      install: {
        ...install,
        version: install.version ?? init.agentInfo.version,
      },
      ...(message ? { message } : {}),
      models: toAcpEngineModels(models, {
        imageInput: init.capabilities.imagePrompts,
      }),
      status: authStatus === "unauthenticated" ? "warning" : "ready",
    };
    return withCatalog(
      { ...result, models: result.models },
      catalog ? { ...catalog, models } : null,
      init.capabilities.imagePrompts,
    );
  } catch (error) {
    return {
      auth: UNKNOWN_AUTH,
      install,
      message: options.signal.aborted
        ? `${descriptor.processLabel} took too long to answer.`
        : `${descriptor.processLabel} failed to start: ${getErrorMessage(error)}`,
      models: toAcpEngineModels(catalog?.models ?? []),
      stale: options.signal.aborted,
      status: "error",
    };
  } finally {
    options.signal.removeEventListener("abort", stop);
    await process.dispose();
  }
}

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  loadAcpRegistry,
  type AcpRegistryCache,
} from "@/lib/ai/chat/engines/acp/registry/catalog";
import {
  describeAcpRegistryDistributions,
  nativeEngineFor,
  readAcpRegistryLaunch,
  uninstallAcpRegistryAgent,
} from "@/lib/ai/chat/engines/acp/registry/install";
import {
  ACP_REGISTRY_AGENT_ID,
  ACP_REGISTRY_FEATURED_AGENTS,
  acpRegistryIconUrl,
  type AcpRegistryAgent,
  type AcpRegistryAgentView,
  type AcpRegistryCatalogView,
} from "@/lib/ai/chat/engines/acp/registry/schema";
import { disposeAcpInstanceProcesses } from "@/lib/ai/chat/engines/acp/launch";
import type { EngineInstanceSummary } from "@/lib/ai/chat/engines/contract";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import {
  EngineMaintenanceError,
  getEngineMaintenanceService,
} from "@/lib/ai/chat/engines/platform/maintenance/service";
import { MANAGED_INSTALL_OPTION_ID } from "@/lib/ai/chat/engines/platform/maintenance/inspect";
import { getEngineSnapshotService } from "@/lib/ai/chat/engines/platform/snapshot-service";
import { buildPreferredExecutablePathValue } from "@/lib/runtime/platform-paths";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { toEngineInstanceTRPCError } from "./instances";

// api.engines.acpRegistry: the Settings browser for the ACP Registry. The
// index is fetched only when the user browses (when the cached copy is
// older than 6 h) or presses Refresh. Installing creates (or reuses) the
// user's `acp` instance for the agent, then runs the driver's managed
// install through the maintenance service, which reports progress in the
// instance's snapshot. Registry agents are third-party programs: the UI
// confirms every install with the agent's source, authors and command.

const agentIdSchema = z.string().trim().regex(ACP_REGISTRY_AGENT_ID);
const MAX_QUERY = 128;

function serverEnv() {
  return {
    ...process.env,
    PATH: buildPreferredExecutablePathValue(process.env.PATH, {
      env: process.env,
    }),
  };
}

function agentIdOf(summary: EngineInstanceSummary) {
  const config = summary.config as Record<string, unknown> | null;
  return summary.driver === "acp" && typeof config?.agentId === "string"
    ? config.agentId
    : null;
}

async function registryInstances(userId: string) {
  const summaries = await getEngineInstanceRegistry().listSummaries(userId);
  return summaries.filter((summary) => summary.driver === "acp");
}

function rank(agent: AcpRegistryAgent, query: string) {
  if (!query) return 0;
  const id = agent.id.toLowerCase();
  const name = agent.name.toLowerCase();
  if (id === query || name === query) return 0;
  if (id.startsWith(query) || name.startsWith(query)) return 1;
  if (id.includes(query) || name.includes(query)) return 2;
  return agent.description.toLowerCase().includes(query) ? 3 : null;
}

async function toView(
  agent: AcpRegistryAgent,
  instances: EngineInstanceSummary[],
  env: Record<string, string | undefined>,
): Promise<AcpRegistryAgentView> {
  return {
    authors: agent.authors ?? [],
    description: agent.description,
    distributions: await describeAcpRegistryDistributions(agent, env),
    featured: ACP_REGISTRY_FEATURED_AGENTS.includes(agent.id),
    iconUrl: acpRegistryIconUrl(agent),
    id: agent.id,
    instanceIds: instances
      .filter((summary) => agentIdOf(summary) === agent.id)
      .map((summary) => summary.id),
    license: agent.license ?? null,
    name: agent.name,
    nativeEngine: nativeEngineFor(agent.id),
    repository: agent.repository ?? null,
    version: agent.version,
    website: agent.website ?? null,
  };
}

async function toCatalogView(
  userId: string,
  result: { cache: AcpRegistryCache | null; error: string | null },
  query = "",
): Promise<AcpRegistryCatalogView> {
  const normalized = query.trim().toLowerCase();
  const instances = await registryInstances(userId);
  const env = serverEnv();
  const agents = (result.cache?.index.agents ?? [])
    .flatMap((agent) => {
      const score = rank(agent, normalized);
      return score === null ? [] : [{ agent, score }];
    })
    .sort((left, right) => {
      const featured =
        Number(ACP_REGISTRY_FEATURED_AGENTS.includes(right.agent.id)) -
        Number(ACP_REGISTRY_FEATURED_AGENTS.includes(left.agent.id));
      return (
        featured ||
        left.score - right.score ||
        left.agent.name.localeCompare(right.agent.name)
      );
    });
  return {
    agents: await Promise.all(
      agents.map(({ agent }) => toView(agent, instances, env)),
    ),
    fetchedAt: result.cache?.fetchedAt ?? null,
    fetchError: result.error,
    registryVersion: result.cache?.index.version ?? null,
  };
}

async function requireAgent(agentId: string) {
  const { cache } = await loadAcpRegistry({ refresh: "never" });
  const agent = cache?.index.agents.find((entry) => entry.id === agentId);
  if (!agent) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${agentId} is not in the ACP Registry. Refresh the registry and try again.`,
    });
  }
  return agent;
}

/** Ends the agent's processes, removes its files, re-probes its instances. */
async function removeAgentFiles(userId: string, agentId: string) {
  const instances = (await registryInstances(userId)).filter(
    (summary) => agentIdOf(summary) === agentId,
  );
  await Promise.all(
    instances.map((summary) => disposeAcpInstanceProcesses(summary.id)),
  );
  await uninstallAcpRegistryAgent(agentId);
  await Promise.all(
    instances.map((summary) =>
      getEngineSnapshotService()
        .refresh(userId, summary.id, "update")
        .catch(() => null),
    ),
  );
  return instances.map((summary) => summary.id);
}

const MAINTENANCE_ERROR_CODES = {
  busy: "CONFLICT",
  changed: "CONFLICT",
  not_found: "NOT_FOUND",
  unavailable: "PRECONDITION_FAILED",
} as const;

export const engineAcpRegistryRouter = createTRPCRouter({
  /** The browser's list: the cached index, refetched when it is stale. */
  list: protectedProcedure
    .input(
      z
        .object({
          forceRefresh: z.boolean().optional(),
          query: z.string().max(MAX_QUERY).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) =>
      toCatalogView(
        ctx.session.user.id,
        await loadAcpRegistry({
          refresh: input?.forceRefresh ? "force" : "if-stale",
        }),
        input?.query,
      ),
    ),

  /** Filters the cached index (never fetches). */
  search: protectedProcedure
    .input(z.object({ query: z.string().max(MAX_QUERY) }))
    .query(async ({ ctx, input }) =>
      toCatalogView(
        ctx.session.user.id,
        await loadAcpRegistry({ refresh: "never" }),
        input.query,
      ),
    ),

  /** Fetches the index now. */
  refresh: protectedProcedure.mutation(async ({ ctx }) =>
    toCatalogView(
      ctx.session.user.id,
      await loadAcpRegistry({ refresh: "force" }),
    ),
  ),

  /** One agent with what is installed for it. */
  inspect: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(async ({ ctx, input }) => {
      const agent = await requireAgent(input.agentId);
      const [view, launch] = await Promise.all([
        toView(
          agent,
          await registryInstances(ctx.session.user.id),
          serverEnv(),
        ),
        readAcpRegistryLaunch(agent.id),
      ]);
      return {
        ...view,
        installed: launch
          ? {
              distribution: launch.distribution,
              installedAt: launch.installedAt,
              packageSpec: launch.packageSpec,
              verified: launch.verified,
              version: launch.version,
            }
          : null,
      };
    }),

  /**
   * Adds the agent as an instance (or reuses the user's instance of it)
   * and installs it with the distribution the user confirmed.
   */
  install: protectedProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        distribution: z.enum(["auto", "binary", "npx", "uvx"]).default("auto"),
        instanceId: z.string().trim().min(1).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const agent = await requireAgent(input.agentId);
      const registry = getEngineInstanceRegistry();
      const instances = await registryInstances(userId);
      let instance =
        instances.find(
          (summary) =>
            summary.id === input.instanceId && agentIdOf(summary) === agent.id,
        ) ?? instances.find((summary) => agentIdOf(summary) === agent.id);
      const iconUrl = acpRegistryIconUrl(agent);
      try {
        if (!instance) {
          instance = await registry.create(userId, {
            config: {
              agentId: agent.id,
              agentName: agent.name,
              distribution: input.distribution,
              ...(iconUrl ? { iconUrl } : {}),
            },
            driver: "acp",
            label: agent.name,
          });
        } else {
          const config = (instance.config ?? {}) as Record<string, unknown>;
          if (config.distribution !== input.distribution) {
            instance = await registry.update(userId, instance.id, {
              config: { ...config, distribution: input.distribution },
            });
          }
        }
      } catch (error) {
        throw toEngineInstanceTRPCError(error);
      }
      // Already installed at this version (another instance of the agent):
      // nothing to download. A new registry version replaces the old one.
      const maintenance = getEngineMaintenanceService();
      const snapshots = getEngineSnapshotService();
      const launch = await readAcpRegistryLaunch(agent.id);
      const sameRelease =
        launch?.version === agent.version &&
        (input.distribution === "auto" ||
          launch.distribution === input.distribution);
      if (launch && sameRelease) {
        await snapshots
          .refresh(userId, instance.id, "update")
          .catch(() => null);
        return {
          instanceId: instance.id,
          status: await maintenance.status(userId, instance.id),
        };
      }
      if (launch) {
        await removeAgentFiles(userId, agent.id);
      }
      try {
        const status = await maintenance.install(userId, instance.id, {
          expectedCommand: null,
          optionId: MANAGED_INSTALL_OPTION_ID,
        });
        return { instanceId: instance.id, status };
      } catch (error) {
        if (error instanceof EngineMaintenanceError) {
          throw new TRPCError({
            code: MAINTENANCE_ERROR_CODES[error.code],
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Removes what Sentinel installed for the agent. Its instances stay
   * (Settings removes those) and report it as not installed.
   */
  uninstall: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .mutation(async ({ ctx, input }) => ({
      instanceIds: await removeAgentFiles(ctx.session.user.id, input.agentId),
      ok: true,
    })),
});

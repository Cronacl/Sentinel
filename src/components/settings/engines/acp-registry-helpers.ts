import { getDriverLabel } from "@/lib/ai/chat/engines/catalog";
import type {
  AcpRegistryAgentView,
  AcpRegistryDistributionKind,
  AcpRegistryDistributionView,
} from "@/lib/ai/chat/engines/acp/registry/schema";

// Pure helpers of the ACP Registry browser (Settings → Engines).

/** Filters the listed agents by name, id or description (featured first stays). */
export function filterRegistryAgents(
  agents: readonly AcpRegistryAgentView[],
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...agents];
  }
  return agents.filter((agent) =>
    [agent.id, agent.name, agent.description].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
}

/** The distribution offered first: the first one that can install here. */
export function defaultRegistryDistribution(
  agent: Pick<AcpRegistryAgentView, "distributions">,
): AcpRegistryDistributionKind | null {
  return agent.distributions.find((entry) => entry.available)?.kind ?? null;
}

const KIND_LABELS: Record<AcpRegistryDistributionKind, string> = {
  binary: "Download",
  npx: "npm package",
  uvx: "uv tool",
};

export function registryDistributionLabel(kind: AcpRegistryDistributionKind) {
  return KIND_LABELS[kind];
}

/** One line per distribution for the agent row. */
export function describeRegistryDistribution(
  entry: AcpRegistryDistributionView,
) {
  const label = KIND_LABELS[entry.kind];
  if (entry.advisory) {
    return `${label}: ${entry.advisory}`;
  }
  if (entry.kind === "binary") {
    return `${label} from ${entry.detail}${entry.verified ? "" : " (no published checksum)"}`;
  }
  return `${label} ${entry.detail}`;
}

export function registryNativeEngineNote(agent: AcpRegistryAgentView) {
  return agent.nativeEngine
    ? `Also available as the native ${getDriverLabel(agent.nativeEngine)} engine.`
    : null;
}

/** What the user confirms before Sentinel installs and runs the agent. */
export function describeRegistryInstall(
  agent: AcpRegistryAgentView,
  kind: AcpRegistryDistributionKind,
) {
  const entry = agent.distributions.find(
    (distribution) => distribution.kind === kind,
  );
  const by = agent.authors.length > 0 ? ` by ${agent.authors.join(", ")}` : "";
  const what =
    kind === "binary"
      ? `Downloads ${agent.name} ${agent.version} from ${entry?.detail ?? "its publisher"}${
          entry?.verified
            ? " and checks its SHA-256."
            : ". The registry publishes no checksum for it, so the download cannot be verified."
        }`
      : kind === "npx"
        ? `Runs npm install --global ${entry?.detail ?? ""} into Sentinel's own tools folder.`
        : `Runs uv tool install --force ${entry?.detail ?? ""} into Sentinel's own tools folder.`;
  return {
    body: [
      `${agent.name}${by} is a third-party program: once installed, Sentinel runs it with access to the workspaces you chat in.`,
      what,
      ...(agent.repository ? [`Source: ${agent.repository}`] : []),
    ],
    confirmLabel: agent.instanceIds.length > 0 ? "Reinstall" : "Install",
    title: `Install ${agent.name}?`,
  };
}

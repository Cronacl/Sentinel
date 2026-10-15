import { z } from "zod";

// The ACP Registry (https://github.com/agentclientprotocol/registry) as
// Sentinel reads it: the index, one agent's distributions, platform targets
// and what the browser shows. Client-safe (no Node imports). Validation
// follows t3code's AcpRegistrySupport.ts (MIT): bounded strings, HTTPS
// archives without credentials, exact npx/uvx versions; an agent that does
// not validate is dropped, never the whole index.

export const ACP_REGISTRY_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const ACP_REGISTRY_CDN =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/";

export const ACP_REGISTRY_AGENT_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const EXACT_VERSION =
  "v?[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";
const EXACT_NPX_PACKAGE = new RegExp(
  `^(?:@[^/@\\s]+/[^@\\s]+|[a-z0-9][a-z0-9._-]*)@${EXACT_VERSION}$`,
  "i",
);
const EXACT_UVX_PACKAGE = new RegExp(
  `^[a-z0-9][a-z0-9._-]*(?:@|==)${EXACT_VERSION}$`,
  "i",
);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const ACP_REGISTRY_MAX_AGENTS = 512;

export const ACP_REGISTRY_PLATFORM_TARGETS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-aarch64",
  "linux-x86_64",
  "windows-aarch64",
  "windows-x86_64",
] as const;
export type AcpRegistryPlatformTarget =
  (typeof ACP_REGISTRY_PLATFORM_TARGETS)[number];

export const ACP_REGISTRY_DISTRIBUTIONS = ["binary", "npx", "uvx"] as const;
export type AcpRegistryDistributionKind =
  (typeof ACP_REGISTRY_DISTRIBUTIONS)[number];
export type AcpRegistryDistributionPreference =
  AcpRegistryDistributionKind | "auto";

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

const httpsUrl = z.string().max(2_048).refine(isHttpsUrl, {
  message: "ACP Registry URLs must use HTTPS without credentials.",
});
const argument = z.string().max(1_024);
const args = z.array(argument).max(64);
const env = z
  .record(z.string().regex(ENV_NAME), argument)
  .refine((value) => Object.keys(value).length <= 64);

const packageDistribution = (pattern: RegExp) =>
  z.object({
    args: args.optional(),
    env: env.optional(),
    package: z.string().max(256).regex(pattern, {
      message: "Registry packages must name an exact version.",
    }),
  });

export const acpRegistryBinaryTargetSchema = z.object({
  archive: httpsUrl,
  args: args.optional(),
  cmd: argument.min(1),
  env: env.optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

export const acpRegistryAgentSchema = z.object({
  authors: z.array(z.string().max(256)).max(16).optional(),
  description: z.string().max(1_024).default(""),
  distribution: z.object({
    binary: z
      .record(z.string().max(64), acpRegistryBinaryTargetSchema)
      .optional(),
    npx: packageDistribution(EXACT_NPX_PACKAGE).optional(),
    uvx: packageDistribution(EXACT_UVX_PACKAGE).optional(),
  }),
  icon: httpsUrl.optional(),
  id: z.string().regex(ACP_REGISTRY_AGENT_ID),
  license: z.string().max(128).optional(),
  name: z.string().trim().min(1).max(160),
  repository: httpsUrl.optional(),
  version: z.string().trim().regex(VERSION),
  website: httpsUrl.optional(),
});

export type AcpRegistryAgent = z.infer<typeof acpRegistryAgentSchema>;
export type AcpRegistryBinaryTarget = z.infer<
  typeof acpRegistryBinaryTargetSchema
>;

export type AcpRegistryIndex = {
  agents: AcpRegistryAgent[];
  version: string;
};

const indexEnvelopeSchema = z.object({
  agents: z.array(z.unknown()).max(ACP_REGISTRY_MAX_AGENTS),
  version: z.string().trim().min(1).max(128),
});

/** The index with every agent that validates (null: not a registry index). */
export function parseAcpRegistryIndex(value: unknown): AcpRegistryIndex | null {
  const envelope = indexEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return null;
  }
  const seen = new Set<string>();
  const agents = envelope.data.agents.flatMap((raw) => {
    const agent = acpRegistryAgentSchema.safeParse(raw);
    if (!agent.success || seen.has(agent.data.id)) {
      return [];
    }
    seen.add(agent.data.id);
    return [agent.data];
  });
  return { agents, version: envelope.data.version };
}

/** The only icon URL Sentinel shows for an agent: its own on the registry CDN. */
export function acpRegistryIconUrl(
  agent: Pick<AcpRegistryAgent, "icon" | "id">,
) {
  const expected = `${ACP_REGISTRY_CDN}${agent.id}.svg`;
  return agent.icon === expected ? expected : null;
}

export function resolveAcpRegistryPlatformTarget(
  platform: string,
  arch: string,
): AcpRegistryPlatformTarget | null {
  const os =
    platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : platform === "win32"
          ? "windows"
          : null;
  const cpu = arch === "arm64" ? "aarch64" : arch === "x64" ? "x86_64" : null;
  return os && cpu ? (`${os}-${cpu}` as AcpRegistryPlatformTarget) : null;
}

export type ResolvedAcpRegistryDistribution =
  | {
      args: string[];
      env: Record<string, string>;
      kind: "binary";
      target: AcpRegistryBinaryTarget;
    }
  | {
      args: string[];
      env: Record<string, string>;
      kind: "npx" | "uvx";
      packageSpec: string;
    };

/**
 * Whether the managed installer can unpack a binary archive (zip, tar,
 * tar.gz, tar.bz2 or a raw executable). Mirrors managed-install's
 * detectArchiveKind, which this client-safe module cannot import.
 */
export function isSupportedAcpRegistryArchive(url: string) {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Validated as HTTPS already.
  }
  const lower = pathname.toLowerCase();
  if (/\.tar\.bz2$|\.tbz2?$/.test(lower)) return true;
  return !/\.(?:tar\.)?(?:bz2|xz|zst|7z|rar)$|\.txz$/.test(lower);
}

/** The distribution to install: `auto` prefers binary, then npx, then uvx. */
export function resolveAcpRegistryDistribution(
  agent: AcpRegistryAgent,
  preference: AcpRegistryDistributionPreference,
  target: AcpRegistryPlatformTarget | null,
): ResolvedAcpRegistryDistribution | null {
  const kinds: readonly AcpRegistryDistributionKind[] =
    preference === "auto" ? ACP_REGISTRY_DISTRIBUTIONS : [preference];
  for (const kind of kinds) {
    if (kind === "binary") {
      const binary = target ? agent.distribution.binary?.[target] : undefined;
      if (binary && isSupportedAcpRegistryArchive(binary.archive)) {
        return {
          args: binary.args ?? [],
          env: binary.env ?? {},
          kind,
          target: binary,
        };
      }
      continue;
    }
    const pkg = agent.distribution[kind];
    if (pkg) {
      return {
        args: pkg.args ?? [],
        env: pkg.env ?? {},
        kind,
        packageSpec: pkg.package,
      };
    }
  }
  return null;
}

/** "@scope/name@1.2.3" or "name==1.2.3" → name and version. */
export function parseAcpRegistryPackageSpec(
  kind: "npx" | "uvx",
  spec: string,
): { name: string; version: string } {
  const equals = kind === "uvx" ? spec.lastIndexOf("==") : -1;
  const at = equals >= 0 ? equals : spec.lastIndexOf("@");
  return {
    name: spec.slice(0, at),
    version: spec.slice(at + (equals >= 0 ? 2 : 1)).replace(/^v/i, ""),
  };
}

/**
 * Registry agents Sentinel also drives natively: installing them from the
 * registry is allowed, the browser just says so.
 */
export const ACP_REGISTRY_NATIVE_ENGINES: Readonly<Record<string, string>> = {
  "antigravity-acp": "antigravity",
  "claude-acp": "claude",
  "codex-acp": "codex",
  cursor: "cursor",
  "github-copilot-cli": "copilot",
  "grok-build": "grok",
  opencode: "opencode",
  "pi-acp": "pi",
};

/** Shown first in the browser (design §3.4: Gemini CLI). */
export const ACP_REGISTRY_FEATURED_AGENTS: readonly string[] = ["gemini"];

export type AcpRegistryDistributionView = {
  /** Why it cannot be installed here (a missing npm or uv), else null. */
  advisory: string | null;
  available: boolean;
  /** What runs: the archive host, or the package spec. */
  detail: string;
  kind: AcpRegistryDistributionKind;
  /** Binary archives: whether the registry pins a SHA-256. */
  verified: boolean | null;
};

/** One agent as the Settings browser lists it. */
export type AcpRegistryAgentView = {
  authors: string[];
  description: string;
  distributions: AcpRegistryDistributionView[];
  featured: boolean;
  iconUrl: string | null;
  id: string;
  /** Instance ids of this user's instances of the agent. */
  instanceIds: string[];
  license: string | null;
  name: string;
  /** A native Sentinel engine drives the same agent ("cursor"). */
  nativeEngine: string | null;
  repository: string | null;
  version: string;
  website: string | null;
};

export type AcpRegistryCatalogView = {
  agents: AcpRegistryAgentView[];
  /** When the cached index was fetched (ISO), null before the first fetch. */
  fetchedAt: string | null;
  /** The last fetch failed (the cached index, if any, is still listed). */
  fetchError: string | null;
  registryVersion: string | null;
};

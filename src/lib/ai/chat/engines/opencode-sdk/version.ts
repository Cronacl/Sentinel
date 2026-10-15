// Which OpenCode server generation a binary or a running server speaks
// (design acp-and-agents §5). Ported from t3code
// packages/provider-opencode/src/server/versionProbe.ts (MIT).
//
// - `opencode --version` prints `1.18.32` on 1.x and `opencode v2.0.18` on
//   2.x; a major of 2 or more is the 2.x generation.
// - Over HTTP, 2.x answers `GET /api/info {version, pid}` and 1.x answers
//   `GET /global/health {healthy: true, version}`. Each serves its web UI's
//   HTML with a 200 on the other's path, so only a JSON body counts, and a
//   401 says nothing about the version.

export type OpenCodeGeneration = "v1" | "v2";

export type OpenCodeSemver = readonly [
  major: number,
  minor: number,
  patch: number,
];

export type ProbedOpenCode = {
  generation: OpenCodeGeneration;
  version: string;
};

// Snapshot builds such as `0.0.0-dev-202610062254` stay unknown rather
// than "too old".
export function parseOpenCodeSemver(
  value: string | null | undefined,
): OpenCodeSemver | null {
  const firstLine = value?.trim().split(/\r?\n/)[0] ?? "";
  for (const token of firstLine.split(/\s+/)) {
    const match = token.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (match) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
  }
  return null;
}

export function compareOpenCodeSemver(
  left: OpenCodeSemver,
  right: OpenCodeSemver,
) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The generation `opencode --version` output belongs to, or null. */
export function classifyOpenCodeVersion(
  output: string | null | undefined,
): ProbedOpenCode | null {
  const parsed = parseOpenCodeSemver(output);
  if (!parsed) return null;
  return {
    generation: parsed[0] >= 2 ? "v2" : "v1",
    version: parsed.join("."),
  };
}

const OPENCODE_SERVER_PROBE_PATHS = ["/api/info", "/global/health"] as const;

function isJsonResponse(response: Response) {
  return (
    response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

async function probePath(
  path: (typeof OPENCODE_SERVER_PROBE_PATHS)[number],
  input: { authorization: string | null; baseUrl: string; timeoutMs: number },
): Promise<ProbedOpenCode | "unauthorized" | null> {
  try {
    const url = new URL(input.baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(input.authorization ? { authorization: input.authorization } : {}),
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      return "unauthorized";
    }
    if (response.status !== 200 || !isJsonResponse(response)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = (await response.json()) as {
      healthy?: unknown;
      pid?: unknown;
      version?: unknown;
    } | null;
    if (typeof body?.version !== "string") return null;
    if (path === "/api/info") {
      return typeof body.pid === "number"
        ? { generation: "v2", version: body.version }
        : null;
    }
    return body.healthy === true
      ? { generation: "v1", version: body.version }
      : null;
  } catch {
    return null;
  }
}

/**
 * Asks a running server which generation it is: `/api/info` first, then
 * `/global/health`. "unauthorized" when both refused the password, null
 * when neither answered with JSON (not up yet, or not OpenCode).
 */
export async function probeOpenCodeServer(input: {
  authorization: string | null;
  baseUrl: string;
  /** Per request (default 1 s). */
  timeoutMs?: number;
}): Promise<ProbedOpenCode | "unauthorized" | null> {
  const options = { ...input, timeoutMs: input.timeoutMs ?? 1_000 };
  let unauthorized = false;
  for (const path of OPENCODE_SERVER_PROBE_PATHS) {
    const result = await probePath(path, options);
    if (result === "unauthorized") {
      unauthorized = true;
      continue;
    }
    if (result) return result;
  }
  return unauthorized ? "unauthorized" : null;
}

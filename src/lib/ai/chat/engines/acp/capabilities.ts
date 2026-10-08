import packageJson from "../../../../../../package.json";

import type { AcpAgentDescriptor } from "./descriptor";
import type { JsonRecord } from "./schema";

// clientCapabilities Sentinel advertises in `initialize` (design §2.4).
// fs and terminal methods are served only when the descriptor opts in, and
// never for probes (nothing would answer them). Terminal auth methods are
// accepted so they can be reported; running them is the auth flow's job.

export type AcpClientContext = "probe" | "session";

export function buildClientCapabilities(
  descriptor: Pick<
    AcpAgentDescriptor,
    "clientCapabilitiesMeta" | "clientFs" | "clientTerminals"
  >,
  context: AcpClientContext,
): JsonRecord {
  const session = context === "session";
  const fs = session && descriptor.clientFs === true;

  return {
    auth: { terminal: true },
    elicitation: session ? { form: {}, url: {} } : null,
    fs: { readTextFile: fs, writeTextFile: fs },
    plan: {},
    session: { configOptions: {} },
    terminal: session && descriptor.clientTerminals === true,
    ...(descriptor.clientCapabilitiesMeta
      ? { _meta: descriptor.clientCapabilitiesMeta }
      : {}),
  };
}

/** `clientInfo` on initialize: Sentinel's own version, not "0.0.0". */
export function buildClientInfo(version?: string | null) {
  const appVersion =
    typeof packageJson.version === "string" ? packageJson.version : null;
  return {
    name: "sentinel",
    title: "Sentinel",
    version: version?.trim() || appVersion || "0.0.0",
  };
}

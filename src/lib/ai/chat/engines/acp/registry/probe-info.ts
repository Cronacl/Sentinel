import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { AcpAuthMethodInfo } from "../schema";

// What a registry agent's last full probe learned that the auth controller
// needs without starting the agent: its sign-in methods and whether it can
// sign out. Kept in <state root>/engines/<instanceId>/registry-probe.json.

const FILE = "registry-probe.json";

const authMethodSchema = z.object({
  args: z.array(z.string()),
  description: z.string().nullable(),
  env: z.record(z.string(), z.string()),
  id: z.string(),
  kind: z.enum(["agent", "env_var", "terminal"]),
  link: z.string().nullable(),
  name: z.string(),
  vars: z.array(
    z.object({
      label: z.string().nullable(),
      name: z.string(),
      optional: z.boolean(),
    }),
  ),
});

const probeInfoSchema = z.object({
  agentName: z.string().nullable(),
  agentVersion: z.string().nullable(),
  authMethods: z.array(authMethodSchema),
  canLogout: z.boolean(),
  checkedAt: z.string(),
});

export type AcpRegistryProbeInfo = z.infer<typeof probeInfoSchema>;

export async function readAcpRegistryProbeInfo(
  stateDir: string,
): Promise<AcpRegistryProbeInfo | null> {
  try {
    const parsed = probeInfoSchema.safeParse(
      JSON.parse(await readFile(path.join(stateDir, FILE), "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeAcpRegistryProbeInfo(
  stateDir: string,
  info: Omit<AcpRegistryProbeInfo, "authMethods"> & {
    authMethods: readonly AcpAuthMethodInfo[];
  },
) {
  await mkdir(stateDir, { mode: 0o700, recursive: true });
  const file = path.join(stateDir, FILE);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(info), { mode: 0o600 });
  await rename(temp, file);
}

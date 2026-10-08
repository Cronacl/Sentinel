import "server-only";

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

// What Sentinel installed, written next to it: the receipt is the proof a
// directory under <state root>/tools/ is a complete install (it is written
// last, before the directory is moved into place) and records where it came
// from. `active.json` in the tool's directory names the version in use.

export const MANAGED_TOOL_RECEIPT_FILE = ".sentinel-receipt.json";
export const MANAGED_TOOL_ACTIVE_FILE = "active.json";

export const managedToolReceiptSchema = z.object({
  archive: z.enum(["raw", "tar", "tar.gz", "zip"]),
  /** The executable's path relative to the install directory. */
  executable: z.string().min(1),
  installedAt: z.iso.datetime(),
  schemaVersion: z.literal(1),
  source: z.object({
    bytes: z.number().int().min(0),
    /** The download's own SHA-256. */
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.string().url(),
    /** False when no hash was pinned (the UI calls it unverified). */
    verified: z.boolean(),
  }),
  tool: z.string().min(1),
  version: z.string().min(1),
});

export type ManagedToolReceipt = z.infer<typeof managedToolReceiptSchema>;

const activeSchema = z.object({ version: z.string().min(1) });

export async function readManagedToolReceipt(installDir: string) {
  try {
    const parsed = managedToolReceiptSchema.safeParse(
      JSON.parse(
        await readFile(
          path.join(installDir, MANAGED_TOOL_RECEIPT_FILE),
          "utf8",
        ),
      ),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeManagedToolReceipt(
  installDir: string,
  receipt: ManagedToolReceipt,
) {
  await writeFile(
    path.join(installDir, MANAGED_TOOL_RECEIPT_FILE),
    `${JSON.stringify(managedToolReceiptSchema.parse(receipt), null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
}

export async function readActiveManagedToolVersion(toolDir: string) {
  try {
    const parsed = activeSchema.safeParse(
      JSON.parse(
        await readFile(path.join(toolDir, MANAGED_TOOL_ACTIVE_FILE), "utf8"),
      ),
    );
    return parsed.success ? parsed.data.version : null;
  } catch {
    return null;
  }
}

/** Points the tool at `version`, atomically. */
export async function writeActiveManagedToolVersion(
  toolDir: string,
  version: string,
) {
  const target = path.join(toolDir, MANAGED_TOOL_ACTIVE_FILE);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version })}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

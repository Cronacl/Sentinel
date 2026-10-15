import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

// Per-process temp directories (Antigravity's ~1 GB unpack per launch):
// each process gets its own under the root, removed when it exits; a sweep
// removes leftovers but never a running process's directory.
mock.module("server-only", () => ({}));

const { acpLaunchFingerprint, startAcpProcess, sweepAcpTempDirectories } =
  await import("./launch");
const { mockDescriptor } = await import("./__tests__/mock-agent");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function waitFor(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

describe.skipIf(process.platform === "win32")("ACP temp directories", () => {
  it("gives each process its own directory and removes it on exit", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-acp-tmp-"));
    roots.push(dir);
    const root = path.join(dir, "tmp");
    const out = path.join(dir, "out");
    const launch = {
      args: ["-c", 'printf "%s" "$TMPDIR" > "$OUT"; sleep 0.3'],
      command: "/bin/sh",
      cwd: dir,
      env: { OUT: out, PATH: process.env.PATH, TMPDIR: root },
      tempDirectory: { root, variables: ["TMPDIR"] },
    };
    // The fingerprint sees only the root: pooled processes stay reusable.
    expect(acpLaunchFingerprint(launch)).toBe(acpLaunchFingerprint(launch));

    await mkdir(path.join(root, "run-stale"), { recursive: true });
    const started = startAcpProcess(mockDescriptor(), launch);
    await waitFor(
      async () => (await readFile(out, "utf8").catch(() => "")) !== "",
    );
    const own = await readFile(out, "utf8");
    expect(path.dirname(own)).toBe(root);
    expect(path.basename(own)).toStartWith("run-");

    // The sweep keeps the running process's directory only.
    await sweepAcpTempDirectories(root);
    expect(await readdir(root)).toEqual([path.basename(own)]);

    await started.exited;
    await waitFor(async () => (await readdir(root)).length === 0);
  });
});

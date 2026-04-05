import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { __internal, resolveRipgrepPath } from "./ripgrep";

const tempRoots: string[] = [];

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-ripgrep-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("resolveRipgrepPath", () => {
  it("prefers a system rg binary when available", async () => {
    const root = await createTempRoot();
    const systemPath = path.join(root, "bin", "rg");

    await mkdir(path.dirname(systemPath), { recursive: true });
    await writeFile(systemPath, "rg");

    const resolved = await resolveRipgrepPath({
      homeDir: root,
      whichExecutable: async () => systemPath,
    });

    expect(resolved).toBe(systemPath);
  });

  it("uses the cached Sentinel-managed binary when present", async () => {
    const root = await createTempRoot();
    const managedDirectory = __internal.getManagedRipgrepDirectory({
      homeDir: root,
      platformKey: "arm64-darwin",
    });
    const managedPath = path.join(managedDirectory, "rg");

    await mkdir(managedDirectory, { recursive: true });
    await writeFile(managedPath, "rg");

    const resolved = await resolveRipgrepPath({
      arch: "arm64",
      homeDir: root,
      platform: "darwin",
      whichExecutable: async () => null,
    });

    expect(resolved).toBe(managedPath);
  });

  it("downloads and installs a managed ripgrep binary when needed", async () => {
    const root = await createTempRoot();
    const fetchImpl = mock(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
      ok: true,
      status: 200,
      statusText: "OK",
    }));
    const extractArchive = mock(
      async ({ extractDirectory }: { extractDirectory: string }) => {
        const extractedPath = path.join(extractDirectory, "ripgrep", "rg");
        await mkdir(path.dirname(extractedPath), { recursive: true });
        await writeFile(extractedPath, "rg");
      },
    );

    const resolved = await resolveRipgrepPath({
      arch: "arm64",
      extractArchive,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      homeDir: root,
      platform: "darwin",
      whichExecutable: async () => null,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(extractArchive).toHaveBeenCalledTimes(1);
    expect(await __internal.pathExists(resolved)).toBe(true);
    expect(path.basename(resolved)).toBe("rg");
  });

  it("serializes concurrent installs for the same managed binary", async () => {
    const root = await createTempRoot();
    const fetchImpl = mock(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
      ok: true,
      status: 200,
      statusText: "OK",
    }));
    const extractArchive = mock(
      async ({ extractDirectory }: { extractDirectory: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const extractedPath = path.join(extractDirectory, "ripgrep", "rg");
        await mkdir(path.dirname(extractedPath), { recursive: true });
        await writeFile(extractedPath, "rg");
      },
    );

    const [first, second] = await Promise.all([
      resolveRipgrepPath({
        arch: "arm64",
        extractArchive,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        homeDir: root,
        platform: "darwin",
        whichExecutable: async () => null,
      }),
      resolveRipgrepPath({
        arch: "arm64",
        extractArchive,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        homeDir: root,
        platform: "darwin",
        whichExecutable: async () => null,
      }),
    ]);

    expect(first).toBe(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(extractArchive).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly for unsupported platforms", async () => {
    await expect(
      resolveRipgrepPath({
        arch: "arm64",
        homeDir: await createTempRoot(),
        platform: "win32",
        whichExecutable: async () => null,
      }),
    ).rejects.toThrow(/windows arm64/i);
  });

  it("fails cleanly when the download request fails", async () => {
    const root = await createTempRoot();

    await expect(
      resolveRipgrepPath({
        arch: "arm64",
        fetchImpl: (async () =>
          ({
            ok: false,
            status: 503,
            statusText: "Unavailable",
          }) as Response) as typeof fetch,
        homeDir: root,
        platform: "darwin",
        whichExecutable: async () => null,
      }),
    ).rejects.toThrow(/failed to download ripgrep/i);
  });
});

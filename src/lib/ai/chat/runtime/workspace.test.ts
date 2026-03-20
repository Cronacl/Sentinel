import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveAvailableWorkspaceRootPath } from "./workspace-path";

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const targetPath = cleanupPaths.pop();
    if (!targetPath) {
      continue;
    }

    await rm(targetPath, { force: true, recursive: true }).catch(() => undefined);
  }
});

describe("resolveAvailableWorkspaceRootPath", () => {
  it("returns a normalized existing directory path", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-workspace-"));
    cleanupPaths.push(tempDirectory);

    expect(
      await resolveAvailableWorkspaceRootPath(`${tempDirectory}${path.sep}`),
    ).toBe(tempDirectory);
  });

  it("returns null for a missing directory", async () => {
    const missingDirectory = path.join(
      os.tmpdir(),
      `sentinel-missing-${Date.now()}`,
    );

    expect(await resolveAvailableWorkspaceRootPath(missingDirectory)).toBeNull();
  });

  it("returns null for a file path", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-workspace-"));
    cleanupPaths.push(tempDirectory);
    const filePath = path.join(tempDirectory, "file.txt");
    await writeFile(filePath, "value", "utf8");

    expect(await resolveAvailableWorkspaceRootPath(filePath)).toBeNull();
  });

  it("returns null for a relative path", async () => {
    expect(await resolveAvailableWorkspaceRootPath("./workspace")).toBeNull();
  });
});

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "@/lib/process/run-command";

import {
  applyRepoCheckpointPatch,
  buildRepoCheckpointDiff,
  createRepoCheckpointSnapshot,
  disposeRepoCheckpointSnapshot,
  restoreRepoCheckpointTree,
} from "./checkpoints";

async function createDirectory(prefix: string) {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

async function runGit(args: string[], cwd: string) {
  const result = await runCommand({
    args,
    command: "git",
    cwd,
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

async function createRepo() {
  const directory = await createDirectory("sentinel-checkpoints-");
  await runGit(["init", "-b", "main"], directory);
  await runGit(["config", "user.email", "sentinel@example.com"], directory);
  await runGit(["config", "user.name", "Sentinel"], directory);
  await writeFile(path.join(directory, "file.ts"), "export const value = 1;\n");
  await writeFile(
    path.join(directory, "image.bin"),
    Buffer.from([0x00, 0x01, 0x02]),
  );
  await runGit(["add", "-A"], directory);
  await runGit(["commit", "-m", "Initial commit"], directory);
  return directory;
}

describe("repo checkpoints", () => {
  it("builds forward and reverse patches for text and binary changes", async () => {
    const repoRoot = await createRepo();
    const snapshot = await createRepoCheckpointSnapshot(repoRoot);

    try {
      await writeFile(
        path.join(repoRoot, "file.ts"),
        "export const value = 2;\n",
      );
      await writeFile(path.join(repoRoot, "new.ts"), "export const n = 1;\n");
      await writeFile(
        path.join(repoRoot, "image.bin"),
        Buffer.from([0x03, 0x04, 0x05]),
      );

      const diff = await buildRepoCheckpointDiff(snapshot);
      expect(diff.changedPaths.sort()).toEqual(
        ["file.ts", "image.bin", "new.ts"].sort(),
      );

      const reverseResult = await applyRepoCheckpointPatch({
        patch: diff.reversePatch,
        projectPath: repoRoot,
      });
      expect(reverseResult.failedPaths).toEqual([]);
      expect(await readFile(path.join(repoRoot, "file.ts"), "utf8")).toBe(
        "export const value = 1;\n",
      );
      expect(await readFile(path.join(repoRoot, "image.bin"))).toEqual(
        Buffer.from([0x00, 0x01, 0x02]),
      );
      await expect(
        readFile(path.join(repoRoot, "new.ts"), "utf8"),
      ).rejects.toThrow();

      const forwardResult = await applyRepoCheckpointPatch({
        patch: diff.forwardPatch,
        projectPath: repoRoot,
      });
      expect(forwardResult.failedPaths).toEqual([]);
      expect(await readFile(path.join(repoRoot, "file.ts"), "utf8")).toBe(
        "export const value = 2;\n",
      );
      expect(await readFile(path.join(repoRoot, "image.bin"))).toEqual(
        Buffer.from([0x03, 0x04, 0x05]),
      );
      expect(await readFile(path.join(repoRoot, "new.ts"), "utf8")).toBe(
        "export const n = 1;\n",
      );
    } finally {
      await disposeRepoCheckpointSnapshot(snapshot);
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it("applies non-conflicting files even when another file conflicts", async () => {
    const repoRoot = await createRepo();
    const snapshot = await createRepoCheckpointSnapshot(repoRoot);

    try {
      await writeFile(
        path.join(repoRoot, "file.ts"),
        "export const value = 2;\n",
      );
      await writeFile(
        path.join(repoRoot, "extra.ts"),
        "export const ok = 1;\n",
      );
      const diff = await buildRepoCheckpointDiff(snapshot);

      await applyRepoCheckpointPatch({
        patch: diff.reversePatch,
        projectPath: repoRoot,
      });
      await writeFile(
        path.join(repoRoot, "file.ts"),
        "export const value = 999;\n",
      );
      await unlink(path.join(repoRoot, "extra.ts")).catch(() => undefined);

      const result = await applyRepoCheckpointPatch({
        patch: diff.forwardPatch,
        projectPath: repoRoot,
      });

      expect(result.appliedPaths).toContain("extra.ts");
      expect(result.failedPaths).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "file.ts",
          }),
        ]),
      );
      expect(await readFile(path.join(repoRoot, "extra.ts"), "utf8")).toBe(
        "export const ok = 1;\n",
      );
      expect(await readFile(path.join(repoRoot, "file.ts"), "utf8")).toBe(
        "export const value = 999;\n",
      );
    } finally {
      await disposeRepoCheckpointSnapshot(snapshot);
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it("restores the exact checkpoint tree state for the latest checkpoint", async () => {
    const repoRoot = await createRepo();
    const snapshot = await createRepoCheckpointSnapshot(repoRoot);

    try {
      await writeFile(
        path.join(repoRoot, "file.ts"),
        "export const value = 2;\n",
      );
      await writeFile(
        path.join(repoRoot, "extra.ts"),
        "export const ok = 1;\n",
      );
      const diff = await buildRepoCheckpointDiff(snapshot);

      await writeFile(
        path.join(repoRoot, "file.ts"),
        "export const value = 999;\n",
      );
      await unlink(path.join(repoRoot, "extra.ts")).catch(() => undefined);

      const result = await restoreRepoCheckpointTree({
        projectPath: repoRoot,
        repoRoot,
        targetTreeHash: diff.afterTreeHash,
      });

      expect(result.failedPaths).toEqual([]);
      expect(await readFile(path.join(repoRoot, "file.ts"), "utf8")).toBe(
        "export const value = 2;\n",
      );
      expect(await readFile(path.join(repoRoot, "extra.ts"), "utf8")).toBe(
        "export const ok = 1;\n",
      );
    } finally {
      await disposeRepoCheckpointSnapshot(snapshot);
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});

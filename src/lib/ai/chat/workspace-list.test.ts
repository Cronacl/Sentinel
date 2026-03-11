import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  WORKSPACE_LIST_LIMIT,
  executeWorkspaceList,
} from "./workspace-list";

const tempRoots: string[] = [];

async function createWorkspace() {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "sentinel-workspace-list-"),
  );
  tempRoots.push(workspaceRoot);
  return workspaceRoot;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("executeWorkspaceList", () => {
  it("lists a workspace tree and skips default ignored folders", async () => {
    const workspaceRoot = await createWorkspace();

    await mkdir(path.join(workspaceRoot, "src", "lib"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "node_modules", "pkg"), {
      recursive: true,
    });
    await mkdir(path.join(workspaceRoot, ".git"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "README.md"), "# Sentinel\n");
    await writeFile(path.join(workspaceRoot, "src", "index.ts"), "export {};\n");
    await writeFile(path.join(workspaceRoot, "src", "lib", "utils.ts"), "export {};\n");
    await writeFile(
      path.join(workspaceRoot, "node_modules", "pkg", "index.js"),
      "module.exports = {};\n",
    );

    const result = await executeWorkspaceList({
      input: {},
      workspaceRoot,
    });

    expect(result.root).toBe(".");
    expect(result.directoryCount).toBe(2);
    expect(result.fileCount).toBe(3);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/lib",
      "src/lib/utils.ts",
      "src/index.ts",
      "README.md",
    ]);
    expect(result.tree).toContain("src/");
    expect(result.tree).not.toContain("node_modules/");
    expect(result.tree).not.toContain(".git/");
  });

  it("rejects paths that escape the linked workspace", async () => {
    const workspaceRoot = await createWorkspace();

    await expect(
      executeWorkspaceList({
        input: { path: "../outside" },
        workspaceRoot,
      }),
    ).rejects.toThrow(/inside the linked workspace root/i);
  });

  it("applies custom ignore patterns", async () => {
    const workspaceRoot = await createWorkspace();

    await mkdir(path.join(workspaceRoot, "src", "generated"), {
      recursive: true,
    });
    await writeFile(path.join(workspaceRoot, "src", "keep.ts"), "keep\n");
    await writeFile(
      path.join(workspaceRoot, "src", "generated", "client.ts"),
      "generated\n",
    );

    const result = await executeWorkspaceList({
      input: { ignore: ["src/generated/**"] },
      workspaceRoot,
    });

    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/keep.ts",
    ]);
  });

  it("marks the result as truncated after the entry limit", async () => {
    const workspaceRoot = await createWorkspace();

    await mkdir(path.join(workspaceRoot, "files"), { recursive: true });

    await Promise.all(
      Array.from({ length: WORKSPACE_LIST_LIMIT + 20 }, (_, index) =>
        writeFile(
          path.join(workspaceRoot, "files", `file-${String(index).padStart(3, "0")}.txt`),
          "x\n",
        ),
      ),
    );

    const result = await executeWorkspaceList({
      input: {},
      workspaceRoot,
    });

    expect(result.truncated).toBe(true);
    expect(result.totalEntries).toBe(WORKSPACE_LIST_LIMIT);
  });
});

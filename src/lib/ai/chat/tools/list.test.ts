import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { __internal, executeList, LIST_LIMIT } from "./list";

const tempRoots: string[] = [];

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-list-"));
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

describe("executeList", () => {
  it("lists a project tree and skips default ignored folders", async () => {
    const defaultDirectory = await createWorkspace();

    await mkdir(path.join(defaultDirectory, "src", "lib"), { recursive: true });
    await mkdir(path.join(defaultDirectory, "node_modules", "pkg"), {
      recursive: true,
    });
    await mkdir(path.join(defaultDirectory, ".git"), { recursive: true });
    await writeFile(path.join(defaultDirectory, "README.md"), "# Sentinel\n");
    await writeFile(
      path.join(defaultDirectory, "src", "index.ts"),
      "export {};\n",
    );
    await writeFile(
      path.join(defaultDirectory, "src", "lib", "utils.ts"),
      "export {};\n",
    );

    const result = await executeList({
      defaultDirectory,
      input: {},
      permissionMode: "default",
    });

    expect(result.root).toBe(".");
    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/lib",
      "src/lib/utils.ts",
      "src/index.ts",
      "README.md",
    ]);
  });

  it("rejects absolute and escaping paths in default mode", async () => {
    const defaultDirectory = await createWorkspace();

    await expect(
      executeList({
        defaultDirectory,
        input: { path: "/tmp" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/relative paths/i);

    await expect(
      executeList({
        defaultDirectory,
        input: { path: "../outside" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/inside the selected workspace root/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createWorkspace();
    const externalDirectory = await createWorkspace();

    await writeFile(path.join(externalDirectory, "outside.txt"), "hello\n");

    const result = await executeList({
      defaultDirectory,
      input: { path: externalDirectory },
      permissionMode: "full",
    });

    expect(result.root).toBe(externalDirectory);
    expect(result.entries.map((entry) => entry.path)).toEqual(["outside.txt"]);
  });

  it("applies custom ignore patterns", async () => {
    const defaultDirectory = await createWorkspace();

    await mkdir(path.join(defaultDirectory, "src", "generated"), {
      recursive: true,
    });
    await writeFile(path.join(defaultDirectory, "src", "keep.ts"), "keep\n");
    await writeFile(
      path.join(defaultDirectory, "src", "generated", "client.ts"),
      "generated\n",
    );

    const result = await executeList({
      defaultDirectory,
      input: { ignore: ["src/generated/**"] },
      permissionMode: "default",
    });

    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/keep.ts",
    ]);
  });

  it("marks the result as truncated after the entry limit", async () => {
    const defaultDirectory = await createWorkspace();

    await mkdir(path.join(defaultDirectory, "files"), { recursive: true });
    await Promise.all(
      Array.from({ length: LIST_LIMIT + 20 }, (_, index) =>
        writeFile(
          path.join(
            defaultDirectory,
            "files",
            `file-${String(index).padStart(3, "0")}.txt`,
          ),
          "x\n",
        ),
      ),
    );

    const result = await executeList({
      defaultDirectory,
      input: {},
      permissionMode: "default",
    });

    expect(result.truncated).toBe(true);
    expect(result.totalEntries).toBe(LIST_LIMIT);
  });

  it("stops descending once maxDepth is reached", async () => {
    const defaultDirectory = await createWorkspace();

    await mkdir(path.join(defaultDirectory, "src", "deep", "nested"), {
      recursive: true,
    });
    await writeFile(
      path.join(defaultDirectory, "src", "deep", "nested", "file.ts"),
      "export {};",
    );

    const result = await executeList({
      defaultDirectory,
      input: { maxDepth: 1 },
      permissionMode: "default",
    });

    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/deep",
    ]);
    expect(result.truncated).toBe(true);
  });

  it("applies the default depth limit when none is provided", async () => {
    const defaultDirectory = await createWorkspace();
    const segments = Array.from(
      { length: __internal.DEFAULT_MAX_DEPTH + 2 },
      (_, index) => `dir-${index}`,
    );
    const deepDirectory = path.join(defaultDirectory, ...segments);

    await mkdir(deepDirectory, { recursive: true });
    await writeFile(path.join(deepDirectory, "deep.txt"), "hello\n");

    const result = await executeList({
      defaultDirectory,
      input: {},
      permissionMode: "default",
    });

    expect(result.entries.at(-1)?.path).not.toBe(
      path.join(...segments, "deep.txt").replaceAll(path.sep, "/"),
    );
    expect(result.truncated).toBe(true);
  });
});

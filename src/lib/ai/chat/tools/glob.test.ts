import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { __internal, executeGlob } from "./glob";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-glob-"));
}

describe("executeGlob", () => {
  it("finds files by pattern", async () => {
    const defaultDirectory = await createDirectory();
    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(path.join(defaultDirectory, "src", "app.ts"), "");
    await writeFile(path.join(defaultDirectory, "src", "app.test.ts"), "");

    const result = await executeGlob({
      defaultDirectory,
      input: { pattern: "**/*.test.ts" },
      permissionMode: "default",
    });

    expect(result.files).toEqual(["src/app.test.ts"]);
    expect(result.requestedPath).toBe(".");
    expect(result.resolvedBase).toBe(defaultDirectory);
    expect(result.resolvedPath).toBe(defaultDirectory);
    expect(result.truncated).toBe(false);
  });

  it("rejects absolute paths in default mode", async () => {
    const defaultDirectory = await createDirectory();

    await expect(
      executeGlob({
        defaultDirectory,
        input: { path: defaultDirectory, pattern: "*.ts" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/relative paths/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    await writeFile(path.join(externalDirectory, "outside.ts"), "");

    const result = await executeGlob({
      defaultDirectory,
      input: { path: externalDirectory, pattern: "*.ts" },
      permissionMode: "full",
    });

    expect(result.root).toBe(externalDirectory);
    expect(result.files).toEqual(["outside.ts"]);
  });

  it("truncates large result sets", async () => {
    const defaultDirectory = await createDirectory();

    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        writeFile(path.join(defaultDirectory, `file-${index}.ts`), ""),
      ),
    );

    const result = await executeGlob({
      defaultDirectory,
      input: { pattern: "*.ts" },
      permissionMode: "default",
    });

    expect(result.shownFiles).toBe(100);
    expect(result.totalFiles).toBe(105);
    expect(result.truncated).toBe(true);
  }, 15_000);

  it("stops recursion at the configured max depth", async () => {
    const defaultDirectory = await createDirectory();
    const deepFile = path.join(defaultDirectory, "a", "b", "c", "deep.ts");

    await mkdir(path.dirname(deepFile), { recursive: true });
    await writeFile(deepFile, "");

    const result = await executeGlob({
      defaultDirectory,
      input: { maxDepth: 1, pattern: "**/*.ts" },
      permissionMode: "default",
    });

    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it("uses a safe default recursion limit", async () => {
    const defaultDirectory = await createDirectory();
    const segments = Array.from(
      { length: __internal.DEFAULT_MAX_DEPTH + 2 },
      (_, index) => `dir-${index}`,
    );
    const deepFile = path.join(defaultDirectory, ...segments, "deep.ts");

    await mkdir(path.dirname(deepFile), { recursive: true });
    await writeFile(deepFile, "");

    const result = await executeGlob({
      defaultDirectory,
      input: { pattern: "**/*.ts" },
      permissionMode: "default",
    });

    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});

import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeBatchRead } from "./batch-read";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-batch-read-"));
}

describe("executeBatchRead", () => {
  it("reads multiple paths in order", async () => {
    const defaultDirectory = await createDirectory();
    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(path.join(defaultDirectory, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(defaultDirectory, "src", "b.ts"), "export const b = 2;\n");

    const result = await executeBatchRead({
      defaultDirectory,
      input: {
        paths: ["src/a.ts", "src", "src/b.ts"],
      },
      permissionMode: "default",
    });

    expect(result.results.map((item) => item.path)).toEqual([
      "src/a.ts",
      "src",
      "src/b.ts",
    ]);
    expect(result.results[0]?.kind).toBe("file");
    expect(result.results[1]?.kind).toBe("directory");
  });
});

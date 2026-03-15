import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeMoveFile } from "./move-file";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-move-file-"));
}

describe("executeMoveFile", () => {
  it("moves a file across directories", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "old.ts"), "export const value = 1;\n");

    const result = await executeMoveFile({
      defaultDirectory,
      input: {
        fromPath: "old.ts",
        rationale: "Rename module",
        toPath: "src/new.ts",
      },
      permissionMode: "default",
    });

    expect(result.fromPath).toBe("old.ts");
    expect(result.toPath).toBe("src/new.ts");
    expect(await readFile(path.join(defaultDirectory, "src", "new.ts"), "utf8")).toBe(
      "export const value = 1;\n",
    );
  });

  it("rejects missing sources", async () => {
    const defaultDirectory = await createDirectory();

    await expect(
      executeMoveFile({
        defaultDirectory,
        input: {
          fromPath: "missing.ts",
          rationale: "Rename module",
          toPath: "src/new.ts",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects existing destinations", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "old.ts"), "export const oldValue = 1;\n");
    await writeFile(path.join(defaultDirectory, "new.ts"), "export const newValue = 2;\n");

    await expect(
      executeMoveFile({
        defaultDirectory,
        input: {
          fromPath: "old.ts",
          rationale: "Rename module",
          toPath: "new.ts",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/already exists/i);
  });
});

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeCreateFile } from "./create-file";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-create-file-"));
}

describe("executeCreateFile", () => {
  it("creates a new file", async () => {
    const defaultDirectory = await createDirectory();

    const result = await executeCreateFile({
      defaultDirectory,
      input: {
        content: "export const value = 1;\n",
        path: "src/value.ts",
        rationale: "Add a new module",
      },
      permissionMode: "default",
    });

    expect(result.path).toBe("src/value.ts");
    expect(
      await readFile(path.join(defaultDirectory, "src", "value.ts"), "utf8"),
    ).toBe("export const value = 1;\n");
  });

  it("rejects existing paths", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "exists.txt"), "hello\n");

    await expect(
      executeCreateFile({
        defaultDirectory,
        input: {
          content: "world\n",
          path: "exists.txt",
          rationale: "Replace file",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    const externalPath = path.join(externalDirectory, "outside.txt");

    await executeCreateFile({
      defaultDirectory,
      input: {
        content: "outside\n",
        path: externalPath,
        rationale: "Add external file",
      },
      permissionMode: "full",
    });

    expect(await readFile(externalPath, "utf8")).toBe("outside\n");
  });
});

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeEdit } from "./edit";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-edit-"));
}

describe("executeEdit", () => {
  it("replaces a single matching region", async () => {
    const defaultDirectory = await createDirectory();
    const filePath = path.join(defaultDirectory, "app.ts");
    await writeFile(filePath, "const value = 1;\n");

    const result = await executeEdit({
      defaultDirectory,
      input: {
        newString: "const value = 2;",
        oldString: "const value = 1;",
        path: "app.ts",
        rationale: "Update the constant",
      },
      permissionMode: "default",
    });

    expect(result.replacements).toBe(1);
    expect(await readFile(filePath, "utf8")).toContain("const value = 2;");
  });

  it("preserves line endings and supports replaceAll", async () => {
    const defaultDirectory = await createDirectory();
    const filePath = path.join(defaultDirectory, "windows.txt");
    await writeFile(filePath, "a\r\na\r\n", "utf8");

    await executeEdit({
      defaultDirectory,
      input: {
        newString: "b",
        oldString: "a",
        path: "windows.txt",
        rationale: "Rename token",
        replaceAll: true,
      },
      permissionMode: "default",
    });

    expect(await readFile(filePath, "utf8")).toBe("b\r\nb\r\n");
  });

  it("rejects ambiguous replacements", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "dup.txt"), "x\nx\n");

    await expect(
      executeEdit({
        defaultDirectory,
        input: {
          newString: "y",
          oldString: "x",
          path: "dup.txt",
          rationale: "Rename token",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/replaceAll=true/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    const externalPath = path.join(externalDirectory, "file.txt");
    await writeFile(externalPath, "hello\n");

    await executeEdit({
      defaultDirectory,
      input: {
        newString: "world",
        oldString: "hello",
        path: externalPath,
        rationale: "Rename greeting",
      },
      permissionMode: "full",
    });

    expect(await readFile(externalPath, "utf8")).toContain("world");
  });
});

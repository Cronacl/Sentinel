import { describe, expect, it } from "bun:test";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeDeleteFile } from "./delete-file";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-delete-file-"));
}

describe("executeDeleteFile", () => {
  it("deletes an existing file", async () => {
    const defaultDirectory = await createDirectory();
    const targetPath = path.join(defaultDirectory, "remove.txt");
    await access(path.dirname(targetPath));
    await writeFile(targetPath, "remove me");

    const result = await executeDeleteFile({
      defaultDirectory,
      input: {
        path: "remove.txt",
        rationale: "Clean up temp file",
      },
      permissionMode: "default",
    });

    expect(result.path).toBe("remove.txt");
    await expect(access(targetPath)).rejects.toThrow();
  });

  it("rejects directories", async () => {
    const defaultDirectory = await createDirectory();
    await mkdir(path.join(defaultDirectory, "folder"));

    await expect(
      executeDeleteFile({
        defaultDirectory,
        input: {
          path: "folder",
          rationale: "Remove folder",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/not a file/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    const externalPath = path.join(externalDirectory, "outside.txt");
    await writeFile(externalPath, "outside");

    await executeDeleteFile({
      defaultDirectory,
      input: {
        path: externalPath,
        rationale: "Delete external file",
      },
      permissionMode: "full",
    });

    await expect(access(externalPath)).rejects.toThrow();
  });
});

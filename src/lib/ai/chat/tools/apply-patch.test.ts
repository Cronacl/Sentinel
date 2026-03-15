import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeApplyPatch } from "./apply-patch";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-apply-patch-"));
}

describe("executeApplyPatch", () => {
  it("applies add, update, delete, and move operations", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "edit.ts"), "const value = 1;\n");
    await writeFile(path.join(defaultDirectory, "delete.ts"), "delete me\n");
    await writeFile(path.join(defaultDirectory, "move.ts"), "export const moveMe = true;\n");

    const result = await executeApplyPatch({
      defaultDirectory,
      input: {
        patchText: [
          "*** Begin Patch",
          "*** Add File: added.ts",
          "+export const added = true;",
          "*** Update File: edit.ts",
          "@@",
          "-const value = 1;",
          "+const value = 2;",
          "*** Delete File: delete.ts",
          "*** Update File: move.ts",
          "*** Move to: nested/moved.ts",
          "@@",
          "-export const moveMe = true;",
          "+export const moved = true;",
          "*** End Patch",
        ].join("\n"),
        rationale: "Apply coordinated refactor",
      },
      permissionMode: "default",
    });

    expect(result.files).toHaveLength(4);
    expect(await readFile(path.join(defaultDirectory, "added.ts"), "utf8")).toBe(
      "export const added = true;",
    );
    expect(await readFile(path.join(defaultDirectory, "edit.ts"), "utf8")).toBe(
      "const value = 2;\n",
    );
    expect(await readFile(path.join(defaultDirectory, "nested", "moved.ts"), "utf8")).toBe(
      "export const moved = true;\n",
    );
  });

  it("rejects malformed and empty patches", async () => {
    const defaultDirectory = await createDirectory();

    await expect(
      executeApplyPatch({
        defaultDirectory,
        input: {
          patchText: "not a patch",
          rationale: "Apply change",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/missing Begin\/End markers/i);

    await expect(
      executeApplyPatch({
        defaultDirectory,
        input: {
          patchText: "*** Begin Patch\n*** End Patch",
          rationale: "Apply change",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/empty patch/i);
  });

  it("rejects paths outside the workspace in default mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    const externalPath = path.join(externalDirectory, "outside.ts");

    await expect(
      executeApplyPatch({
        defaultDirectory,
        input: {
          patchText: [
            "*** Begin Patch",
            `*** Add File: ${externalPath}`,
            "+export const outside = true;",
            "*** End Patch",
          ].join("\n"),
          rationale: "Apply external change",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/only accepts relative paths|must stay inside/i);
  });
});

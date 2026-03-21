import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeDiff } from "./diff";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-diff-"));
}

describe("executeDiff", () => {
  it("compares two files", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "before.ts"),
      "const value = 1;\n",
    );
    await writeFile(
      path.join(defaultDirectory, "after.ts"),
      "const value = 2;\n",
    );

    const result = await executeDiff({
      defaultDirectory,
      input: {
        comparePath: "after.ts",
        path: "before.ts",
      },
      permissionMode: "default",
    });

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.diff).toContain("-const value = 1;");
    expect(result.diff).toContain("+const value = 2;");
  });

  it("compares a file against proposed content", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "src.ts"),
      "const value = 1;\n",
    );

    const result = await executeDiff({
      defaultDirectory,
      input: {
        path: "src.ts",
        proposedContent: "const value = 3;\n",
      },
      permissionMode: "default",
    });

    expect(result.rightPath).toBe("src.ts");
    expect(result.diff).toContain("+const value = 3;");
  });

  it("rejects paths outside the workspace in default mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "src.ts"),
      "const value = 1;\n",
    );
    await writeFile(
      path.join(externalDirectory, "other.ts"),
      "const value = 2;\n",
    );

    await expect(
      executeDiff({
        defaultDirectory,
        input: {
          comparePath: path.join(externalDirectory, "other.ts"),
          path: "src.ts",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/only accepts relative paths|must stay inside/i);
  });
});

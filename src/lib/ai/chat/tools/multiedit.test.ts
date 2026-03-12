import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeMultiEdit } from "./multiedit";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-multiedit-"));
}

describe("executeMultiEdit", () => {
  it("applies multiple exact replacements atomically to one file", async () => {
    const defaultDirectory = await createDirectory();
    const filePath = path.join(defaultDirectory, "app.ts");
    await writeFile(
      filePath,
      'const one = "a";\nconst two = "b";\nconsole.log(one, two);\n',
    );

    const result = await executeMultiEdit({
      defaultDirectory,
      input: {
        edits: [
          {
            newString: 'const one = "alpha";',
            oldString: 'const one = "a";',
          },
          {
            newString: 'const two = "beta";',
            oldString: 'const two = "b";',
          },
        ],
        path: "app.ts",
        rationale: "Rename both constants together",
      },
      permissionMode: "default",
    });

    expect(result).toMatchObject({
      edits: [
        { index: 1, replacements: 1, replaceAll: false },
        { index: 2, replacements: 1, replaceAll: false },
      ],
      editsApplied: 2,
      replacements: 2,
    });
    expect(await readFile(filePath, "utf8")).toContain('const one = "alpha";');
    expect(await readFile(filePath, "utf8")).toContain('const two = "beta";');
  });

  it("supports replaceAll per edit while preserving line endings", async () => {
    const defaultDirectory = await createDirectory();
    const filePath = path.join(defaultDirectory, "windows.txt");
    await writeFile(filePath, "a\r\na\r\nb\r\n", "utf8");

    await executeMultiEdit({
      defaultDirectory,
      input: {
        edits: [
          {
            newString: "x",
            oldString: "a",
            replaceAll: true,
          },
          {
            newString: "y",
            oldString: "b",
          },
        ],
        path: "windows.txt",
        rationale: "Rename tokens",
      },
      permissionMode: "default",
    });

    expect(await readFile(filePath, "utf8")).toBe("x\r\nx\r\ny\r\n");
  });

  it("fails without writing when a later edit is invalid", async () => {
    const defaultDirectory = await createDirectory();
    const filePath = path.join(defaultDirectory, "app.ts");
    const original = "first\nsecond\n";
    await writeFile(filePath, original);

    await expect(
      executeMultiEdit({
        defaultDirectory,
        input: {
          edits: [
            {
              newString: "updated first",
              oldString: "first",
            },
            {
              newString: "updated missing",
              oldString: "missing",
            },
          ],
          path: "app.ts",
          rationale: "Apply two edits",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/edit 2/i);

    expect(await readFile(filePath, "utf8")).toBe(original);
  });
});

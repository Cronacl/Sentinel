import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { __internal, executeGrep } from "./grep";

const tempRoots: string[] = [];

async function createDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-grep-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("executeGrep", () => {
  it("finds regex matches and returns root-relative paths", async () => {
    const defaultDirectory = await createDirectory();

    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(defaultDirectory, "src", "app.ts"),
      "const greeting = 'hello';\nconst target = 'needle';\n",
    );

    const result = await executeGrep({
      defaultDirectory,
      input: { pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.root).toBe(".");
    expect(result.totalMatches).toBe(1);
    expect(result.files).toEqual([
      {
        matches: [{ lineNumber: 2, text: "const target = 'needle';" }],
        path: "src/app.ts",
      },
    ]);
  });

  it("rejects absolute and escaping paths in default mode", async () => {
    const defaultDirectory = await createDirectory();

    await expect(
      executeGrep({
        defaultDirectory,
        input: { path: "/tmp", pattern: "needle" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/relative paths/i);

    await expect(
      executeGrep({
        defaultDirectory,
        input: { path: "../outside", pattern: "needle" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/inside the selected workspace root/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();

    await writeFile(path.join(externalDirectory, "outside.txt"), "needle\n");

    const result = await executeGrep({
      defaultDirectory,
      input: { path: externalDirectory, pattern: "needle" },
      permissionMode: "full",
    });

    expect(result.root).toBe(externalDirectory);
    expect(result.files.map((file) => file.path)).toEqual(["outside.txt"]);
  });

  it("applies include glob filtering", async () => {
    const defaultDirectory = await createDirectory();

    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(path.join(defaultDirectory, "src", "match.ts"), "needle\n");
    await writeFile(path.join(defaultDirectory, "src", "match.js"), "needle\n");

    const result = await executeGrep({
      defaultDirectory,
      input: { include: "*.ts", pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.files.map((file) => file.path)).toEqual(["src/match.ts"]);
  });

  it("returns an empty result when no matches are found", async () => {
    const defaultDirectory = await createDirectory();

    await writeFile(path.join(defaultDirectory, "README.md"), "sentinel\n");

    const result = await executeGrep({
      defaultDirectory,
      input: { pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.totalMatches).toBe(0);
    expect(result.shownMatches).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("reports partial errors for unreadable paths without failing the search", async () => {
    const defaultDirectory = await createDirectory();
    const blockedDirectory = path.join(defaultDirectory, "blocked");

    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await mkdir(blockedDirectory, { recursive: true });
    await writeFile(path.join(defaultDirectory, "src", "match.ts"), "needle\n");
    await writeFile(path.join(blockedDirectory, "secret.txt"), "needle\n");
    await chmod(blockedDirectory, 0o000);

    try {
      const result = await executeGrep({
        defaultDirectory,
        input: { pattern: "needle" },
        permissionMode: "default",
      });

      expect(result.hasPartialErrors).toBe(true);
      expect(result.files.map((file) => file.path)).toContain("src/match.ts");
    } finally {
      await chmod(blockedDirectory, 0o755);
    }
  });

  it("truncates oversized result sets deterministically", async () => {
    const defaultDirectory = await createDirectory();

    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await Promise.all(
      Array.from({ length: __internal.GREP_MATCH_LIMIT + 10 }, (_, index) =>
        writeFile(
          path.join(defaultDirectory, "src", `match-${String(index).padStart(3, "0")}.ts`),
          "needle\n",
        ),
      ),
    );

    const result = await executeGrep({
      defaultDirectory,
      input: { pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.shownMatches).toBe(__internal.GREP_MATCH_LIMIT);
    expect(result.totalMatches).toBe(__internal.GREP_MATCH_LIMIT + 10);
    expect(result.truncated).toBe(true);
  });

  it("excludes matches under .git", async () => {
    const defaultDirectory = await createDirectory();

    await mkdir(path.join(defaultDirectory, ".git"), { recursive: true });
    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(path.join(defaultDirectory, ".git", "config"), "needle\n");
    await writeFile(path.join(defaultDirectory, "src", "visible.ts"), "needle\n");

    const result = await executeGrep({
      defaultDirectory,
      input: { pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.files.map((file) => file.path)).toEqual(["src/visible.ts"]);
  });

  it("trims long match previews for chat rendering", async () => {
    const defaultDirectory = await createDirectory();
    const longLine = `${"a".repeat(__internal.MAX_MATCH_PREVIEW_LENGTH + 30)}needle`;

    await writeFile(path.join(defaultDirectory, "long.txt"), `${longLine}\n`);

    const result = await executeGrep({
      defaultDirectory,
      input: { pattern: "needle" },
      permissionMode: "default",
    });

    expect(result.files[0]?.matches[0]?.text.endsWith("...")).toBe(true);
  });
});

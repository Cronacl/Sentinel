import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeRead } from "./read";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-read-"));
}

describe("executeRead", () => {
  it("reads a bounded file slice with line numbers", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "notes.txt"),
      "one\ntwo\nthree\nfour\n",
    );

    const result = await executeRead({
      defaultDirectory,
      input: { limit: 2, offset: 2, path: "notes.txt" },
      permissionMode: "default",
    });

    expect(result.kind).toBe("file");
    expect(result.lines).toEqual([
      { number: 2, text: "two" },
      { number: 3, text: "three" },
    ]);
    expect(result.nextOffset).toBe(4);
    expect(result.truncated).toBe(true);
  });

  it("reads directory entries", async () => {
    const defaultDirectory = await createDirectory();
    await mkdir(path.join(defaultDirectory, "src"), { recursive: true });
    await writeFile(path.join(defaultDirectory, "README.md"), "");

    const result = await executeRead({
      defaultDirectory,
      input: { path: "." },
      permissionMode: "default",
    });

    expect(result.kind).toBe("directory");
    expect(result.requestedPath).toBe(".");
    expect(result.resolvedBase).toBe(defaultDirectory);
    expect(result.resolvedPath).toBe(defaultDirectory);
    expect(result.entries).toEqual(["README.md", "src/"]);
  });

  it("rejects absolute paths in default mode and binary files", async () => {
    const defaultDirectory = await createDirectory();
    const binaryPath = path.join(defaultDirectory, "data.bin");
    await writeFile(binaryPath, Buffer.from([0, 1, 2, 3]));

    await expect(
      executeRead({
        defaultDirectory,
        input: { path: binaryPath },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/relative paths/i);

    await expect(
      executeRead({
        defaultDirectory,
        input: { path: "data.bin" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/binary file/i);
  });

  it("allows absolute paths in full mode", async () => {
    const defaultDirectory = await createDirectory();
    const externalDirectory = await createDirectory();
    const externalPath = path.join(externalDirectory, "external.txt");
    await writeFile(externalPath, "outside\n");

    const result = await executeRead({
      defaultDirectory,
      input: { path: externalPath },
      permissionMode: "full",
    });

    expect(result.path).toBe(externalPath);
    expect(result.content).toContain("1: outside");
  });

  it("allows absolute paths inside extra skill roots in default mode", async () => {
    const defaultDirectory = await createDirectory();
    const skillDirectory = await createDirectory();
    const skillFile = path.join(skillDirectory, "reference.md");
    await writeFile(skillFile, "skill-reference\n");

    const result = await executeRead({
      defaultDirectory,
      extraAllowedRoots: [skillDirectory],
      input: { path: skillFile },
      permissionMode: "default",
    });

    expect(result.path).toBe(skillFile);
    expect(result.content).toContain("1: skill-reference");
  });
});

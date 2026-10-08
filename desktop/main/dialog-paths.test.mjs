import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDialogDefaultPaths } from "./dialog-paths.mjs";

const tempRoots = [];

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dialog-paths-"));
  tempRoots.push(root);
  const homePath = path.join(root, "home");
  const codePath = path.join(homePath, "code");
  const notesPath = path.join(homePath, "notes");
  await mkdir(codePath, { recursive: true });
  await mkdir(notesPath, { recursive: true });

  return {
    codePath,
    filePath: path.join(root, "userData", "dialog-paths.json"),
    homePath,
    notesPath,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("dialog default paths", () => {
  it("starts in the fallback folder before the first pick", async () => {
    const { filePath, homePath } = await createFixture();
    const dialogPaths = createDialogDefaultPaths({
      fallbackPath: homePath,
      filePath,
    });

    expect(await dialogPaths.current("directory")).toBe(homePath);
    expect(await dialogPaths.current("files")).toBe(homePath);
  });

  it("keeps a separate last folder per dialog kind", async () => {
    const { codePath, filePath, homePath, notesPath } = await createFixture();
    const dialogPaths = createDialogDefaultPaths({
      fallbackPath: homePath,
      filePath,
    });

    await dialogPaths.remember("directory", {
      canceled: false,
      filePaths: [path.join(codePath, "sentinel")],
    });
    await dialogPaths.remember("files", {
      canceled: false,
      filePaths: [path.join(notesPath, "a.md"), path.join(notesPath, "b.md")],
    });

    expect(await dialogPaths.current("directory")).toBe(codePath);
    expect(await dialogPaths.current("files")).toBe(notesPath);
  });

  it("restores the last folders after a restart", async () => {
    const { codePath, filePath, homePath } = await createFixture();
    await createDialogDefaultPaths({
      fallbackPath: homePath,
      filePath,
    }).remember("directory", {
      canceled: false,
      filePaths: [path.join(codePath, "sentinel")],
    });

    const restarted = createDialogDefaultPaths({
      fallbackPath: homePath,
      filePath,
    });
    expect(await restarted.current("directory")).toBe(codePath);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      directory: codePath,
    });
  });

  it("ignores cancelled dialogs, deleted folders and unreadable state", async () => {
    const { codePath, filePath, homePath } = await createFixture();
    const dialogPaths = createDialogDefaultPaths({
      fallbackPath: homePath,
      filePath,
    });

    await dialogPaths.remember("directory", {
      canceled: true,
      filePaths: [path.join(codePath, "sentinel")],
    });
    expect(await dialogPaths.current("directory")).toBe(homePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({ directory: path.join(homePath, "gone") }),
    );
    expect(
      await createDialogDefaultPaths({
        fallbackPath: homePath,
        filePath,
      }).current("directory"),
    ).toBe(homePath);

    await writeFile(filePath, "{not json");
    expect(
      await createDialogDefaultPaths({
        fallbackPath: homePath,
        filePath,
      }).current("files"),
    ).toBe(homePath);
  });
});

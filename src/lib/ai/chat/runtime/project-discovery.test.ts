import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverProjectAwareness } from "./project-discovery";

const tempRoots: string[] = [];

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-project-discovery-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("discoverProjectAwareness", () => {
  it("prefers a strong nested project candidate", async () => {
    const workspaceRoot = await createWorkspace();
    const appRoot = path.join(workspaceRoot, "app");

    await mkdir(path.join(appRoot, "src"), { recursive: true });
    await writeFile(path.join(appRoot, "package.json"), "{}");
    await writeFile(path.join(appRoot, "tsconfig.json"), "{}");

    const result = await discoverProjectAwareness(workspaceRoot);

    expect(result.preferredProjectRoot).toBe(appRoot);
    expect(result.shellStartDirectory).toBe(appRoot);
    expect(result.projectCandidates[0]).toMatchObject({
      kind: "package",
      path: "app",
    });
  });

  it("returns ranked candidates when several plausible projects exist", async () => {
    const workspaceRoot = await createWorkspace();
    const webRoot = path.join(workspaceRoot, "web");
    const docsRoot = path.join(workspaceRoot, "docs");

    await mkdir(path.join(webRoot, "src"), { recursive: true });
    await writeFile(path.join(webRoot, "package.json"), "{}");
    await mkdir(path.join(docsRoot, "pages"), { recursive: true });

    const result = await discoverProjectAwareness(workspaceRoot);

    expect(result.projectCandidates.length).toBeGreaterThanOrEqual(2);
    expect(result.projectCandidates[0]?.path).toBe("web");
    expect(result.projectCandidates[1]?.path).toBe("docs");
  });

  it("treats missing roots as unavailable", async () => {
    const result = await discoverProjectAwareness(
      path.join(os.tmpdir(), `sentinel-missing-${Date.now()}`),
    );

    expect(result.preferredProjectRoot).toBeNull();
    expect(result.projectCandidates).toEqual([]);
    expect(result.shellStartDirectory).toBeNull();
  });
});

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, ".next", "standalone");
const targetRoot = path.join(projectRoot, "desktop", "dist", "server");
const stagedStaticRoot = path.join(targetRoot, ".next", "static");

async function removeMatchingFiles(rootPath, matcher) {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      await removeMatchingFiles(fullPath, matcher);
      continue;
    }

    if (entry.isFile() && matcher(entry.name, fullPath)) {
      await rm(fullPath, { force: true });
    }
  }
}

await rm(targetRoot, { force: true, recursive: true });
await mkdir(targetRoot, { recursive: true });

await cp(sourceRoot, targetRoot, { recursive: true });
await cp(path.join(projectRoot, ".next", "static"), stagedStaticRoot, {
  recursive: true,
});
await removeMatchingFiles(stagedStaticRoot, (name) => name.endsWith(".map"));
await cp(path.join(projectRoot, "public"), path.join(targetRoot, "public"), {
  force: true,
  recursive: true,
});

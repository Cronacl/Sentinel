import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, ".next", "standalone");
const targetRoot = path.join(projectRoot, "desktop", "dist", "server");

await rm(targetRoot, { force: true, recursive: true });
await mkdir(targetRoot, { recursive: true });

await cp(sourceRoot, targetRoot, { recursive: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(targetRoot, ".next", "static"),
  {
    recursive: true,
  },
);
await cp(path.join(projectRoot, "public"), path.join(targetRoot, "public"), {
  force: true,
  recursive: true,
});

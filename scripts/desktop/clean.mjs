import { rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

await rm(path.join(projectRoot, "dist"), {
  force: true,
  recursive: true,
});

await rm(path.join(projectRoot, "desktop", "dist"), {
  force: true,
  recursive: true,
});

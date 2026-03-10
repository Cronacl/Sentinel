import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const shellRoot = path.join(projectRoot, "dist", "desktop-app");

const rootPackageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

await rm(shellRoot, { force: true, recursive: true });
await mkdir(shellRoot, { recursive: true });

await cp(path.join(projectRoot, "desktop"), path.join(shellRoot, "desktop"), {
  recursive: true,
});
await cp(
  path.join(projectRoot, "scripts", "desktop"),
  path.join(shellRoot, "scripts", "desktop"),
  {
    recursive: true,
  },
);

const shellPackageJson = {
  name: `${rootPackageJson.name}-desktop-shell`,
  private: true,
  version: rootPackageJson.version,
  description: rootPackageJson.description,
  author: rootPackageJson.author,
  type: rootPackageJson.type ?? "module",
  main: "desktop/main/index.mjs",
  productName: "sentinel",
};

await writeFile(
  path.join(shellRoot, "package.json"),
  `${JSON.stringify(shellPackageJson, null, 2)}\n`,
);

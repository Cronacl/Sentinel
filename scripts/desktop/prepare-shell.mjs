import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const shellRoot = path.join(projectRoot, "dist", "desktop-app");

const rootPackageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

await rm(shellRoot, { force: true, recursive: true });
await mkdir(shellRoot, { recursive: true });

for (const subdir of ["main", "preload", "shared"]) {
  await cp(
    path.join(projectRoot, "desktop", subdir),
    path.join(shellRoot, "desktop", subdir),
    { recursive: true },
  );
}

const runtimeScripts = [
  "constants.mjs",
  "server-manager.mjs",
  "service-manager.mjs",
  "state.mjs",
];
const scriptsTarget = path.join(shellRoot, "scripts", "desktop");
await mkdir(scriptsTarget, { recursive: true });
for (const file of runtimeScripts) {
  await cp(
    path.join(projectRoot, "scripts", "desktop", file),
    path.join(scriptsTarget, file),
  );
}

const shellPackageJson = {
  name: `${rootPackageJson.name}-desktop-shell`,
  private: true,
  version: rootPackageJson.version,
  description: rootPackageJson.description,
  author: rootPackageJson.author,
  type: rootPackageJson.type ?? "module",
  main: "desktop/main/index.mjs",
  productName: "Sentinel",
};

await writeFile(
  path.join(shellRoot, "package.json"),
  `${JSON.stringify(shellPackageJson, null, 2)}\n`,
);

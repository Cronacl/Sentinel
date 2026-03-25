import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const MANIFEST_FIXES = [
  {
    packageName: "node-pptx-parser",
    expectedVersion: "1.0.01",
    normalizedVersion: "1.0.1",
    reason:
      "electron-builder's Bun dependency traversal rejects the upstream version string with a leading zero",
  },
];

for (const fix of MANIFEST_FIXES) {
  const manifestPath = path.join(
    projectRoot,
    "node_modules",
    fix.packageName,
    "package.json",
  );

  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    continue;
  }

  if (packageJson.version !== fix.expectedVersion) {
    continue;
  }

  packageJson.version = fix.normalizedVersion;
  await writeFile(manifestPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(
    `[desktop] normalized ${fix.packageName} version ${fix.expectedVersion} -> ${fix.normalizedVersion} (${fix.reason}).`,
  );
}

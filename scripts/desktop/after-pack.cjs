const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * @param {string} targetPath
 */
async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} projectDir
 * @param {string} packageName
 */
function resolveNodeModulePath(projectDir, packageName) {
  return path.join(projectDir, "node_modules", ...packageName.split("/"));
}

/**
 * @param {string} projectDir
 * @param {string} targetNodeModulesPath
 * @param {string} packageName
 * @param {Set<string>} [copiedPackages]
 */
async function copyPackageWithDependencies(
  projectDir,
  targetNodeModulesPath,
  packageName,
  copiedPackages = new Set(),
) {
  if (copiedPackages.has(packageName)) {
    return;
  }

  copiedPackages.add(packageName);

  const sourcePackagePath = resolveNodeModulePath(projectDir, packageName);
  const sourcePackageJsonPath = path.join(sourcePackagePath, "package.json");

  if (!(await pathExists(sourcePackageJsonPath))) {
    throw new Error(
      `Expected packaged desktop dependency at ${sourcePackageJsonPath}.`,
    );
  }

  const targetPackagePath = path.join(
    targetNodeModulesPath,
    ...packageName.split("/"),
  );

  await fs.rm(targetPackagePath, { force: true, recursive: true });
  await fs.mkdir(path.dirname(targetPackagePath), { recursive: true });
  await fs.cp(sourcePackagePath, targetPackagePath, { recursive: true });

  const packageJson = JSON.parse(
    await fs.readFile(sourcePackageJsonPath, "utf8"),
  );
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];

  for (const dependencyName of dependencyNames) {
    await copyPackageWithDependencies(
      projectDir,
      targetNodeModulesPath,
      dependencyName,
      copiedPackages,
    );
  }
}

/**
 * @param {{ nodePtyPath: string; platform: string }} options
 */
async function pruneNodePtyForPlatform({ nodePtyPath, platform }) {
  await fs.rm(path.join(nodePtyPath, "deps"), { force: true, recursive: true });
  await fs.rm(path.join(nodePtyPath, "src"), { force: true, recursive: true });
  await fs.rm(path.join(nodePtyPath, "third_party"), {
    force: true,
    recursive: true,
  });

  const prebuildsPath = path.join(nodePtyPath, "prebuilds");
  if (!(await pathExists(prebuildsPath))) {
    return;
  }

  const allowedPrebuilds =
    platform === "darwin"
      ? new Set(["darwin-arm64", "darwin-x64"])
      : platform === "win32"
        ? new Set(["win32-arm64", "win32-x64"])
        : new Set(["linux-arm64", "linux-x64"]);

  const prebuildEntries = await fs.readdir(prebuildsPath, {
    withFileTypes: true,
  });

  for (const entry of prebuildEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (allowedPrebuilds.has(entry.name)) {
      continue;
    }

    await fs.rm(path.join(prebuildsPath, entry.name), {
      force: true,
      recursive: true,
    });
  }
}

/**
 * @param {{
 *   appOutDir: string;
 *   electronPlatformName: string;
 *   packager: { projectDir: string; appInfo: { productFilename: string } };
 * }} context
 */
module.exports = async function afterPack(context) {
  const sourceServerNodeModulesPath = path.join(
    context.packager.projectDir,
    "desktop",
    "dist",
    "server",
    "node_modules",
  );

  if (!(await pathExists(sourceServerNodeModulesPath))) {
    throw new Error(
      `Expected packaged server dependencies at ${sourceServerNodeModulesPath}.`,
    );
  }

  const sourceShellNodePtyPath = path.join(
    context.packager.projectDir,
    "node_modules",
    "node-pty",
  );

  if (!(await pathExists(sourceShellNodePtyPath))) {
    throw new Error(
      `Expected desktop shell dependency at ${sourceShellNodePtyPath}.`,
    );
  }

  const resourcesPath =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");

  const targetServerNodeModulesPath = path.join(
    resourcesPath,
    "server",
    "node_modules",
  );
  const targetShellNodeModulesPath = path.join(resourcesPath, "node_modules");
  const targetShellNodePtyPath = path.join(
    targetShellNodeModulesPath,
    "node-pty",
  );

  await fs.rm(targetServerNodeModulesPath, { force: true, recursive: true });
  await fs.mkdir(path.dirname(targetServerNodeModulesPath), {
    recursive: true,
  });
  await fs.cp(sourceServerNodeModulesPath, targetServerNodeModulesPath, {
    recursive: true,
  });

  await fs.rm(targetShellNodePtyPath, { force: true, recursive: true });
  await fs.mkdir(targetShellNodeModulesPath, { recursive: true });
  await fs.cp(sourceShellNodePtyPath, targetShellNodePtyPath, {
    recursive: true,
  });
  await pruneNodePtyForPlatform({
    nodePtyPath: targetShellNodePtyPath,
    platform: context.electronPlatformName,
  });

  await copyPackageWithDependencies(
    context.packager.projectDir,
    targetShellNodeModulesPath,
    "electron-updater",
  );
};

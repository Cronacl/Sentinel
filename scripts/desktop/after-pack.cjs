const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getCopilotRuntimePackageName,
  getDependencyNamesForPackage,
  getRequiredServerRuntimePackages,
  isPrunedServerPackage,
  normalizeTargetArch,
} = require("./copilot-runtime-packaging.cjs");

/**
 * @typedef {{ arch: number | string; platform: string }} PackageTarget
 */

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
 * Node-style lookup: the dependent's own node_modules first, then each parent
 * node_modules up to the project root. bun nests a dependency next to its
 * dependent when the hoisted copy does not satisfy its range (the Copilot SDK
 * pins zod, for example).
 *
 * @param {string} projectDir
 * @param {string} dependentPath
 * @param {string} dependencyName
 */
async function resolveDependencyPath(
  projectDir,
  dependentPath,
  dependencyName,
) {
  const projectRoot = path.resolve(projectDir);
  let currentPath = path.resolve(dependentPath);

  while (true) {
    const candidatePath = path.join(
      currentPath,
      "node_modules",
      ...dependencyName.split("/"),
    );
    if (await pathExists(path.join(candidatePath, "package.json"))) {
      return candidatePath;
    }

    const parentPath = path.dirname(currentPath);
    if (currentPath === projectRoot || parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
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
 * @param {PackageTarget} target
 */
function isHostTarget(target) {
  const platform = target.platform === "mas" ? "darwin" : target.platform;
  return (
    platform === process.platform &&
    normalizeTargetArch(target.arch) === process.arch
  );
}

/**
 * Copies a top-level package and, recursively, its dependencies into
 * `targetNodeModulesPath`. Dependencies nested under a copied package travel
 * with it; only their own dependencies are walked.
 *
 * @param {string} projectDir
 * @param {string} targetNodeModulesPath
 * @param {string} packageName
 * @param {Set<string>} [copiedPackages]
 * @param {{ target?: PackageTarget }} [options]
 */
async function copyPackageWithDependencies(
  projectDir,
  targetNodeModulesPath,
  packageName,
  copiedPackages = new Set(),
  options = {},
) {
  const target = options.target ?? {
    arch: process.arch,
    platform: process.platform,
  };
  const topLevelNodeModulesPath = path.resolve(projectDir, "node_modules");

  /**
   * @param {string} name
   * @param {string} sourcePackagePath
   */
  async function visit(name, sourcePackagePath) {
    const visitKey = path.resolve(sourcePackagePath);
    if (copiedPackages.has(visitKey)) {
      return;
    }
    copiedPackages.add(visitKey);

    const sourcePackageJsonPath = path.join(sourcePackagePath, "package.json");
    if (!(await pathExists(sourcePackageJsonPath))) {
      throw new Error(
        `Expected packaged desktop dependency at ${sourcePackageJsonPath}.`,
      );
    }

    // Nested copies were already copied inside their dependent's directory.
    if (visitKey === path.join(topLevelNodeModulesPath, ...name.split("/"))) {
      const targetPackagePath = path.join(
        targetNodeModulesPath,
        ...name.split("/"),
      );

      await fs.rm(targetPackagePath, { force: true, recursive: true });
      await fs.mkdir(path.dirname(targetPackagePath), { recursive: true });
      await fs.cp(sourcePackagePath, targetPackagePath, { recursive: true });
    }

    const packageJson = JSON.parse(
      await fs.readFile(sourcePackageJsonPath, "utf8"),
    );
    const optionalDependencyNames = new Set(
      Object.keys(packageJson.optionalDependencies ?? {}),
    );
    const dependencyNames = getDependencyNamesForPackage({
      packageJson,
      packageName: name,
      target,
    });

    for (const dependencyName of dependencyNames) {
      const dependencyPath = await resolveDependencyPath(
        projectDir,
        sourcePackagePath,
        dependencyName,
      );

      if (!dependencyPath) {
        if (!optionalDependencyNames.has(dependencyName)) {
          throw new Error(
            `Expected packaged desktop dependency at ${path.join(resolveNodeModulePath(projectDir, dependencyName), "package.json")}.`,
          );
        }

        if (dependencyName === getCopilotRuntimePackageName(target)) {
          const message = `${dependencyName} is not installed, so the packaged server cannot start the bundled Copilot runtime for ${target.platform}-${target.arch}.`;
          if (isHostTarget(target)) {
            throw new Error(`[desktop] ${message}`);
          }
          console.warn(`[desktop] ${message}`);
        }
        continue;
      }

      await visit(dependencyName, dependencyPath);
    }
  }

  await visit(packageName, resolveNodeModulePath(projectDir, packageName));
}

/**
 * @param {string} projectDir
 * @param {string} targetNodeModulesPath
 * @param {string[]} packageNames
 * @param {{ target?: PackageTarget }} [options]
 */
async function copyPackagesWithDependencies(
  projectDir,
  targetNodeModulesPath,
  packageNames,
  options = {},
) {
  const copiedPackages = new Set();

  for (const packageName of packageNames) {
    await copyPackageWithDependencies(
      projectDir,
      targetNodeModulesPath,
      packageName,
      copiedPackages,
      options,
    );
  }
}

/**
 * Removes packages the target never loads (other platforms' Copilot runtimes,
 * koffi) from a packaged node_modules, including nested copies.
 *
 * @param {{ nodeModulesPath: string; target: PackageTarget }} options
 */
async function prunePackagedServerPackages({ nodeModulesPath, target }) {
  if (!(await pathExists(nodeModulesPath))) {
    return;
  }

  const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(nodeModulesPath, entry.name);
    const packages = entry.name.startsWith("@")
      ? (await fs.readdir(entryPath, { withFileTypes: true }))
          .filter((scopedEntry) => scopedEntry.isDirectory())
          .map((scopedEntry) => ({
            name: `${entry.name}/${scopedEntry.name}`,
            packagePath: path.join(entryPath, scopedEntry.name),
          }))
      : [{ name: entry.name, packagePath: entryPath }];

    for (const { name, packagePath } of packages) {
      if (isPrunedServerPackage(name, target)) {
        await fs.rm(packagePath, { force: true, recursive: true });
        continue;
      }

      await prunePackagedServerPackages({
        nodeModulesPath: path.join(packagePath, "node_modules"),
        target,
      });
    }
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
 *   arch: number | string;
 *   appOutDir: string;
 *   electronPlatformName: string;
 *   packager: { projectDir: string; appInfo: { productFilename: string } };
 * }} context
 */
async function afterPack(context) {
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

  await copyPackagesWithDependencies(
    context.packager.projectDir,
    targetShellNodeModulesPath,
    ["electron-updater"],
  );

  const target = {
    arch: context.arch,
    platform: context.electronPlatformName,
  };
  await copyPackagesWithDependencies(
    context.packager.projectDir,
    targetServerNodeModulesPath,
    getRequiredServerRuntimePackages(),
    { target },
  );
  await prunePackagedServerPackages({
    nodeModulesPath: targetServerNodeModulesPath,
    target,
  });
}

module.exports = afterPack;
module.exports.copyPackageWithDependencies = copyPackageWithDependencies;
module.exports.copyPackagesWithDependencies = copyPackagesWithDependencies;
module.exports.prunePackagedServerPackages = prunePackagedServerPackages;

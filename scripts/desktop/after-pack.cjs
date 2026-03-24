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
};

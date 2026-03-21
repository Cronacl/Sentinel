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
  const sourceNodeModulesPath = path.join(
    context.packager.projectDir,
    "desktop",
    "dist",
    "server",
    "node_modules",
  );

  if (!(await pathExists(sourceNodeModulesPath))) {
    throw new Error(
      `Expected packaged server dependencies at ${sourceNodeModulesPath}.`,
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

  const targetNodeModulesPath = path.join(
    resourcesPath,
    "server",
    "node_modules",
  );

  await fs.rm(targetNodeModulesPath, { force: true, recursive: true });
  await fs.mkdir(path.dirname(targetNodeModulesPath), { recursive: true });
  await fs.cp(sourceNodeModulesPath, targetNodeModulesPath, {
    recursive: true,
  });
};

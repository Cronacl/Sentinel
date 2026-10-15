// Electron 42+ no longer downloads its binary from a postinstall script, so the
// desktop launcher, packaging and CI install it on demand through the
// package's `install-electron` bin. Run: bun run electron:install
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string} [projectRoot]
 */
function getElectronPackageRoot(projectRoot = process.cwd()) {
  return path.join(projectRoot, "node_modules", "electron");
}

/**
 * @param {string} [projectRoot]
 */
export function getElectronDistPath(projectRoot = process.cwd()) {
  return path.join(getElectronPackageRoot(projectRoot), "dist");
}

/**
 * @param {string} [projectRoot]
 * @param {NodeJS.Platform} [platform]
 */
export function getElectronExecutablePath(
  projectRoot = process.cwd(),
  platform = process.platform,
) {
  const distPath = getElectronDistPath(projectRoot);

  switch (platform) {
    case "darwin":
      return path.join(
        distPath,
        "Electron.app",
        "Contents",
        "MacOS",
        "Electron",
      );
    case "win32":
      return path.join(distPath, "electron.exe");
    default:
      return path.join(distPath, "electron");
  }
}

/**
 * @param {string} [projectRoot]
 */
export function getElectronVersion(projectRoot = process.cwd()) {
  const packageJson = JSON.parse(
    readFileSync(
      path.join(getElectronPackageRoot(projectRoot), "package.json"),
      "utf8",
    ),
  );
  return packageJson.version;
}

/**
 * The binary counts as installed only when dist/version matches the installed
 * electron package, so a stale dist from a previous Electron major is replaced.
 *
 * @param {string} [projectRoot]
 */
export function isElectronBinaryInstalled(projectRoot = process.cwd()) {
  try {
    const distVersion = readFileSync(
      path.join(getElectronDistPath(projectRoot), "version"),
      "utf8",
    )
      .trim()
      .replace(/^v/, "");

    return (
      distVersion === getElectronVersion(projectRoot) &&
      existsSync(getElectronExecutablePath(projectRoot))
    );
  } catch {
    return false;
  }
}

/**
 * @param {{ projectRoot?: string; logger?: Pick<Console, "log"> }} [options]
 */
export function ensureElectronBinary({
  projectRoot = process.cwd(),
  logger = console,
} = {}) {
  const executablePath = getElectronExecutablePath(projectRoot);

  if (isElectronBinaryInstalled(projectRoot)) {
    return executablePath;
  }

  const installScriptPath = path.join(
    getElectronPackageRoot(projectRoot),
    "install.js",
  );
  if (!existsSync(installScriptPath)) {
    throw new Error(
      `Expected the electron package at ${getElectronPackageRoot(projectRoot)}. Run \`bun install\` first.`,
    );
  }

  logger.log(
    `[desktop] downloading the Electron ${getElectronVersion(projectRoot)} binary into ${getElectronDistPath(projectRoot)}`,
  );
  // install.js expects Node; the dev launcher itself runs under bun.
  const nodeCommand = process.versions.bun ? "node" : process.execPath;
  const result = spawnSync(nodeCommand, [installScriptPath], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0 || !isElectronBinaryInstalled(projectRoot)) {
    throw new Error(
      `The Electron binary is missing at ${executablePath} and install-electron failed${
        result.error ? `: ${result.error.message}` : ""
      }. Run \`bun run electron:install\` and try again.`,
    );
  }

  return executablePath;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const executablePath = ensureElectronBinary();
  console.log(
    `[desktop] Electron ${getElectronVersion()} binary ready at ${executablePath}`,
  );
}

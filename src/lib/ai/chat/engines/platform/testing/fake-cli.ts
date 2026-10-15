import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Fake engine CLIs and home directories that work on every test host.
// Windows runs neither a `#!/bin/sh` script nor an extensionless file: engine
// resolution only looks at PATHEXT names there, so the fake is a .cmd batch
// shim. Windows also takes the home from USERPROFILE, not HOME.

const originalHome = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
};

/** Points both HOME and USERPROFILE (Windows) at `directory`. */
export function setTestHome(directory: string) {
  process.env.HOME = directory;
  process.env.USERPROFILE = directory;
}

/** Restores HOME and USERPROFILE as they were when this module loaded. */
export function restoreTestHome() {
  for (const [key, value] of Object.entries(originalHome)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// The .cmd extension as PATHEXT spells it, so the path a PATH lookup builds
// from PATHEXT is the path written here.
function windowsCmdExtension() {
  return (
    (process.env.PATHEXT ?? "")
      .split(";")
      .map((extension) => extension.trim())
      .find((extension) => extension.toLowerCase() === ".cmd") ?? ".cmd"
  );
}

/**
 * Writes a fake CLI at `filePath` (a `.cmd` beside it on Windows) and returns
 * the path engine resolution finds for it. Without `source` it only exits 0;
 * with it, the JavaScript in `source` runs under the test runtime
 * (process.execPath) with the CLI's arguments.
 */
export async function writeFakeCli(filePath: string, source?: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const scriptPath = `${filePath}.cjs`;
  if (source !== undefined) {
    await writeFile(scriptPath, source, "utf8");
  }

  if (process.platform === "win32") {
    const cmdPath = `${filePath}${windowsCmdExtension()}`;
    await writeFile(
      cmdPath,
      source === undefined
        ? "@echo off\r\nexit /b 0\r\n"
        : `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
      "utf8",
    );
    return cmdPath;
  }

  await writeFile(
    filePath,
    source === undefined
      ? "#!/bin/sh\nexit 0\n"
      : `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
    "utf8",
  );
  await chmod(filePath, 0o755);
  return filePath;
}

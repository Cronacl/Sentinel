import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type EnvLike = NodeJS.ProcessEnv;

function uniqueEntries(entries: Array<string | null | undefined>) {
  return Array.from(
    new Set(entries.map((entry) => entry?.trim()).filter(Boolean) as string[]),
  );
}

export function getPlatformHomeDirectory(options?: {
  env?: EnvLike;
  platform?: NodeJS.Platform;
}) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;

  if (platform === "win32") {
    const drive = env.HOMEDRIVE?.trim();
    const homePath = env.HOMEPATH?.trim();

    return (
      env.USERPROFILE?.trim() ||
      (drive && homePath ? path.win32.join(drive, homePath) : "") ||
      env.HOME?.trim() ||
      os.homedir()
    );
  }

  return env.HOME?.trim() || os.homedir();
}

function getWindowsExecutableCandidateEntries(env: EnvLike, homePath: string) {
  const appData = env.APPDATA?.trim();
  const localAppData = env.LOCALAPPDATA?.trim();
  const programFiles = env.ProgramFiles?.trim();
  const programFilesX86 = env["ProgramFiles(x86)"]?.trim();

  return uniqueEntries([
    path.win32.join(homePath, ".bun", "bin"),
    path.win32.join(homePath, ".volta", "bin"),
    localAppData ? path.win32.join(localAppData, "Volta", "bin") : null,
    appData ? path.win32.join(appData, "npm") : null,
    localAppData ? path.win32.join(localAppData, "pnpm") : null,
    localAppData ? path.win32.join(localAppData, "fnm") : null,
    env.NVM_SYMLINK?.trim(),
    env.NVM_HOME?.trim(),
    programFiles ? path.win32.join(programFiles, "nodejs") : null,
    programFilesX86 ? path.win32.join(programFilesX86, "nodejs") : null,
    localAppData
      ? path.win32.join(localAppData, "Programs", "Microsoft VS Code", "bin")
      : null,
    localAppData
      ? path.win32.join(
          localAppData,
          "Programs",
          "Cursor",
          "resources",
          "app",
          "bin",
        )
      : null,
    localAppData
      ? path.win32.join(localAppData, "Programs", "Windsurf", "bin")
      : null,
  ]);
}

function getPosixExecutableCandidateEntries(homePath: string) {
  return uniqueEntries([
    path.join(homePath, ".bun", "bin"),
    path.join(homePath, ".local", "bin"),
    path.join(homePath, "bin"),
    path.join(homePath, ".volta", "bin"),
    path.join(homePath, ".asdf", "shims"),
    path.join(homePath, ".nodenv", "shims"),
    path.join(homePath, ".nvm", "current", "bin"),
    path.join(homePath, ".fnm", "current", "bin"),
    path.join(homePath, "Library", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    "/usr/bin",
    "/bin",
  ]);
}

export function buildPreferredExecutablePathValue(
  pathValue?: string | null,
  options?: {
    env?: EnvLike;
    platform?: NodeJS.Platform;
  },
) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const homePath = getPlatformHomeDirectory({ env, platform });
  const pathModule = platform === "win32" ? path.win32 : path.posix;

  const preferredEntries =
    platform === "win32"
      ? getWindowsExecutableCandidateEntries(env, homePath)
      : getPosixExecutableCandidateEntries(homePath);

  const entries = uniqueEntries([
    ...(pathValue ?? "")
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...preferredEntries.map((entry) => pathModule.normalize(entry)),
  ]);

  return entries.join(path.delimiter);
}

async function listSubdirectories(rootPath: string) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

export async function buildManagedExecutablePathValue(
  pathValue?: string | null,
  options?: {
    env?: EnvLike;
    platform?: NodeJS.Platform;
  },
) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const homePath = getPlatformHomeDirectory({ env, platform });

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    const managedEntries = uniqueEntries([
      localAppData ? path.win32.join(localAppData, "fnm") : null,
      env.NVM_HOME?.trim(),
      env.NVM_SYMLINK?.trim(),
    ]);

    return buildPreferredExecutablePathValue(
      [pathValue, ...managedEntries].filter(Boolean).join(path.delimiter),
      { env, platform },
    );
  }

  const managedEntries = [
    ...(
      await listSubdirectories(path.join(homePath, ".nvm", "versions", "node"))
    ).map((directory) => path.join(directory, "bin")),
    ...(
      await listSubdirectories(path.join(homePath, ".fnm", "node-versions"))
    ).map((directory) => path.join(directory, "installation", "bin")),
    ...(
      await listSubdirectories(
        path.join(homePath, ".local", "share", "fnm", "node-versions"),
      )
    ).map((directory) => path.join(directory, "installation", "bin")),
  ];

  return buildPreferredExecutablePathValue(
    [pathValue, ...managedEntries].filter(Boolean).join(path.delimiter),
    { env, platform },
  );
}

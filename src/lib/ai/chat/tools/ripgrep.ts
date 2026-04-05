import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RIPGREP_VERSION = "14.1.1";

const PLATFORM_CONFIG = {
  "arm64-darwin": {
    archiveExtension: "tar.gz",
    executableName: "rg",
    releaseTarget: "aarch64-apple-darwin",
  },
  "arm64-linux": {
    archiveExtension: "tar.gz",
    executableName: "rg",
    releaseTarget: "aarch64-unknown-linux-gnu",
  },
  "x64-darwin": {
    archiveExtension: "tar.gz",
    executableName: "rg",
    releaseTarget: "x86_64-apple-darwin",
  },
  "x64-linux": {
    archiveExtension: "tar.gz",
    executableName: "rg",
    releaseTarget: "x86_64-unknown-linux-musl",
  },
  "x64-win32": {
    archiveExtension: "zip",
    executableName: "rg.exe",
    releaseTarget: "x86_64-pc-windows-msvc",
  },
} as const;

type SupportedPlatformKey = keyof typeof PLATFORM_CONFIG;

type ExtractArchiveInput = {
  archiveExtension: "tar.gz" | "zip";
  archivePath: string;
  extractDirectory: string;
};

type RipgrepResolverOptions = {
  arch?: NodeJS.Architecture;
  extractArchive?: (input: ExtractArchiveInput) => Promise<void>;
  fetchImpl?: typeof fetch;
  homeDir?: string;
  platform?: NodeJS.Platform;
  whichExecutable?: (name: string) => Promise<string | null>;
};

const inflightInstallations = new Map<string, Promise<string>>();

async function pathExists(candidatePath: string) {
  return Boolean(await stat(candidatePath).catch(() => null));
}

async function isExecutableFile(candidatePath: string) {
  const fileStats = await stat(candidatePath).catch(() => null);
  return Boolean(fileStats?.isFile());
}

async function findExecutableOnPath(name: string) {
  const pathValue = process.env.PATH ?? "";
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
  const pathExts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];

  for (const entry of pathEntries) {
    for (const extension of pathExts) {
      const candidatePath = path.join(
        entry,
        process.platform === "win32" && !name.endsWith(extension.toLowerCase())
          ? `${name}${extension.toLowerCase()}`
          : name,
      );

      if (await isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`Command failed with exit code ${code ?? -1}: ${command}`),
      );
    });
  });
}

async function defaultExtractArchive({
  archiveExtension,
  archivePath,
  extractDirectory,
}: ExtractArchiveInput) {
  if (archiveExtension === "tar.gz") {
    await runCommand("tar", ["-xzf", archivePath, "-C", extractDirectory]);
    return;
  }

  await runCommand("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDirectory.replace(/'/g, "''")}' -Force`,
  ]);
}

async function findFileRecursively(
  rootPath: string,
  filename: string,
): Promise<string | null> {
  const directoryEntries = await readdir(rootPath, { withFileTypes: true });

  for (const directoryEntry of directoryEntries) {
    const candidatePath = path.join(rootPath, directoryEntry.name);
    if (directoryEntry.isFile() && directoryEntry.name === filename) {
      return candidatePath;
    }

    if (directoryEntry.isDirectory()) {
      const nestedMatch = await findFileRecursively(candidatePath, filename);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

function getPlatformKey({
  arch,
  platform,
}: {
  arch: NodeJS.Architecture;
  platform: NodeJS.Platform;
}) {
  return `${arch}-${platform}` as SupportedPlatformKey;
}

function getManagedRipgrepDirectory({
  homeDir,
  platformKey,
}: {
  homeDir: string;
  platformKey: SupportedPlatformKey;
}) {
  return path.join(
    homeDir,
    ".sentinel",
    "tools",
    "ripgrep",
    RIPGREP_VERSION,
    platformKey,
  );
}

async function installManagedRipgrep({
  archiveExtension,
  archiveUrl,
  executableName,
  extractArchive,
  fetchImpl,
  installDirectory,
}: {
  archiveExtension: "tar.gz" | "zip";
  archiveUrl: string;
  executableName: string;
  extractArchive: (input: ExtractArchiveInput) => Promise<void>;
  fetchImpl: typeof fetch;
  installDirectory: string;
}) {
  const finalExecutablePath = path.join(installDirectory, executableName);
  const lockKey = finalExecutablePath;
  const existingInstall = inflightInstallations.get(lockKey);

  if (existingInstall) {
    return existingInstall;
  }

  const installationPromise = (async () => {
    if (await isExecutableFile(finalExecutablePath)) {
      return finalExecutablePath;
    }

    await mkdir(installDirectory, { recursive: true });

    const response = await fetchImpl(archiveUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download ripgrep ${RIPGREP_VERSION}: ${response.status} ${response.statusText}`,
      );
    }

    const archiveBytes = Buffer.from(await response.arrayBuffer());
    const archiveFilename = path.basename(new URL(archiveUrl).pathname);
    const archivePath = path.join(installDirectory, archiveFilename);
    const extractDirectory = path.join(installDirectory, "extract");

    await rm(extractDirectory, { force: true, recursive: true });
    await writeFile(archivePath, archiveBytes);
    await mkdir(extractDirectory, { recursive: true });

    try {
      await extractArchive({
        archiveExtension,
        archivePath,
        extractDirectory,
      });

      const extractedExecutablePath = await findFileRecursively(
        extractDirectory,
        executableName,
      );

      if (!extractedExecutablePath) {
        throw new Error(`Ripgrep archive did not contain ${executableName}.`);
      }

      await rename(extractedExecutablePath, finalExecutablePath);
      if (process.platform !== "win32") {
        await chmod(finalExecutablePath, 0o755);
      }
    } finally {
      await rm(archivePath, { force: true, recursive: true });
      await rm(extractDirectory, { force: true, recursive: true });
    }

    return finalExecutablePath;
  })();

  inflightInstallations.set(lockKey, installationPromise);

  try {
    return await installationPromise;
  } finally {
    inflightInstallations.delete(lockKey);
  }
}

export async function resolveRipgrepPath(options: RipgrepResolverOptions = {}) {
  const arch = options.arch ?? process.arch;
  const platform = options.platform ?? process.platform;
  const whichExecutable =
    options.whichExecutable ?? ((name: string) => findExecutableOnPath(name));
  const systemExecutable = await whichExecutable("rg");

  if (systemExecutable && (await isExecutableFile(systemExecutable))) {
    return systemExecutable;
  }

  if (platform === "win32" && arch === "arm64") {
    throw new Error(
      "Ripgrep fallback is not available on Windows ARM64 for this bundled version. Install rg on PATH to enable search tooling.",
    );
  }

  const platformKey = getPlatformKey({ arch, platform });
  const platformConfig = PLATFORM_CONFIG[platformKey];

  if (!platformConfig) {
    throw new Error(`Ripgrep is not supported on platform ${platformKey}.`);
  }

  const homeDir = options.homeDir ?? os.homedir();
  const installDirectory = getManagedRipgrepDirectory({
    homeDir,
    platformKey,
  });
  const managedExecutablePath = path.join(
    installDirectory,
    platformConfig.executableName,
  );

  if (await isExecutableFile(managedExecutablePath)) {
    return managedExecutablePath;
  }

  const archiveFilename = `ripgrep-${RIPGREP_VERSION}-${platformConfig.releaseTarget}.${platformConfig.archiveExtension}`;
  const archiveUrl = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${archiveFilename}`;

  return installManagedRipgrep({
    archiveExtension: platformConfig.archiveExtension,
    archiveUrl,
    executableName: platformConfig.executableName,
    extractArchive: options.extractArchive ?? defaultExtractArchive,
    fetchImpl: options.fetchImpl ?? fetch,
    installDirectory,
  });
}

export const __internal = {
  defaultExtractArchive,
  findExecutableOnPath,
  findFileRecursively,
  getManagedRipgrepDirectory,
  getPlatformKey,
  isExecutableFile,
  pathExists,
  RIPGREP_VERSION,
};

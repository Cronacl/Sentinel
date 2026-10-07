import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type PackageTarget = { arch: number | string; platform: string };
const { copyPackageWithDependencies, prunePackagedServerPackages } =
  require("./after-pack.cjs") as {
    copyPackageWithDependencies: (
      projectDir: string,
      targetNodeModulesPath: string,
      packageName: string,
      copiedPackages?: Set<string>,
      options?: { target?: PackageTarget },
    ) => Promise<void>;
    prunePackagedServerPackages: (options: {
      nodeModulesPath: string;
      target: PackageTarget;
    }) => Promise<void>;
  };

const tempRoots: string[] = [];

async function writePackage(
  rootPath: string,
  packageName: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string> = { "index.js": "export {};\n" },
) {
  const packageRoot = path.join(
    rootPath,
    "node_modules",
    ...packageName.split("/"),
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(packageRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { force: true, recursive: true })),
  );
});

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

const COPILOT_SDK_OPTIONAL_DEPENDENCIES = Object.fromEntries(
  ["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"].map((platform) => [
    `@github/copilot-sdk-${platform}`,
    "1.0.16",
  ]),
);

async function writeCopilotSdkFixture(
  projectDir: string,
  runtimePlatforms: string[],
) {
  await writePackage(projectDir, "@github/copilot-sdk", {
    dependencies: {
      koffi: "3.2.1",
      "vscode-jsonrpc": "8.2.1",
      zod: "4.3.6",
    },
    name: "@github/copilot-sdk",
    optionalDependencies: COPILOT_SDK_OPTIONAL_DEPENDENCIES,
    version: "1.0.16",
  });
  // bun nests the SDK's exact zod pin next to it.
  await writePackage(
    path.join(projectDir, "node_modules", "@github", "copilot-sdk"),
    "zod",
    { name: "zod", version: "4.3.6" },
    { "index.js": "export const version = '4.3.6';\n" },
  );
  await writePackage(
    projectDir,
    "zod",
    { name: "zod", version: "4.6.5" },
    { "index.js": "export const version = '4.6.5';\n" },
  );
  await writePackage(projectDir, "vscode-jsonrpc", {
    name: "vscode-jsonrpc",
    version: "8.2.1",
  });
  await writePackage(projectDir, "koffi", {
    name: "koffi",
    optionalDependencies: { "@koromix/koffi-darwin-arm64": "3.2.1" },
    version: "3.2.1",
  });
  await writePackage(projectDir, "@koromix/koffi-darwin-arm64", {
    name: "@koromix/koffi-darwin-arm64",
    version: "3.2.1",
  });

  for (const runtimePlatform of runtimePlatforms) {
    const executable = runtimePlatform.startsWith("win32")
      ? "copilot-runtime.exe"
      : "copilot-runtime";
    await writePackage(
      projectDir,
      `@github/copilot-sdk-${runtimePlatform}`,
      { name: `@github/copilot-sdk-${runtimePlatform}`, version: "1.0.16" },
      {
        [`prebuilds/${runtimePlatform}/${executable}`]: "runtime",
        [`prebuilds/${runtimePlatform}/runtime.node`]: "native",
        "builtin/review/SKILL.md": "# Skill\n",
      },
    );
  }
}

describe("copyPackageWithDependencies", () => {
  it("copies the Copilot SDK with only the target platform runtime", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "after-pack-test-"));
    tempRoots.push(tempRoot);
    const projectDir = path.join(tempRoot, "project");
    const targetNodeModulesPath = path.join(tempRoot, "target", "node_modules");

    await writeCopilotSdkFixture(projectDir, ["darwin-arm64", "linux-x64"]);
    await writePackage(
      path.join(tempRoot, "target"),
      "zod",
      { name: "zod", version: "4.6.5" },
      { "index.js": "export const version = 'server';\n" },
    );

    await copyPackageWithDependencies(
      projectDir,
      targetNodeModulesPath,
      "@github/copilot-sdk",
      new Set(),
      // electron-builder's Arch enum: 3 is arm64.
      { target: { arch: 3, platform: "darwin" } },
    );

    const runtimeRoot = path.join(
      targetNodeModulesPath,
      "@github",
      "copilot-sdk-darwin-arm64",
    );
    expect(
      await readFile(
        path.join(runtimeRoot, "prebuilds", "darwin-arm64", "runtime.node"),
        "utf8",
      ),
    ).toBe("native");
    // Runtime assets keep files the server prune step would strip.
    expect(
      await pathExists(path.join(runtimeRoot, "builtin", "review", "SKILL.md")),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(targetNodeModulesPath, "vscode-jsonrpc", "package.json"),
      ),
    ).toBe(true);
    // The nested zod pin travels with the SDK; the server's zod is untouched.
    expect(
      await readFile(
        path.join(
          targetNodeModulesPath,
          "@github",
          "copilot-sdk",
          "node_modules",
          "zod",
          "index.js",
        ),
        "utf8",
      ),
    ).toContain("4.3.6");
    expect(
      await readFile(
        path.join(targetNodeModulesPath, "zod", "index.js"),
        "utf8",
      ),
    ).toContain("server");

    for (const absentPackage of [
      ["@github", "copilot-sdk-linux-x64"],
      ["koffi"],
      ["@koromix", "koffi-darwin-arm64"],
    ]) {
      expect(
        await pathExists(path.join(targetNodeModulesPath, ...absentPackage)),
      ).toBe(false);
    }
  });

  it("warns instead of failing when a cross-target runtime is not installed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "after-pack-test-"));
    tempRoots.push(tempRoot);
    const projectDir = path.join(tempRoot, "project");
    const targetNodeModulesPath = path.join(tempRoot, "target", "node_modules");
    await writeCopilotSdkFixture(projectDir, []);

    const crossTarget =
      process.platform === "win32"
        ? { arch: "x64", platform: "linux" }
        : { arch: "x64", platform: "win32" };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await copyPackageWithDependencies(
        projectDir,
        targetNodeModulesPath,
        "@github/copilot-sdk",
        new Set(),
        { target: crossTarget },
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `@github/copilot-sdk-${crossTarget.platform}-x64 is not installed`,
        ),
      );
    } finally {
      warn.mockRestore();
    }

    await expect(
      copyPackageWithDependencies(
        projectDir,
        path.join(tempRoot, "host-target", "node_modules"),
        "@github/copilot-sdk",
        new Set(),
        { target: { arch: process.arch, platform: process.platform } },
      ),
    ).rejects.toThrow(/is not installed/);
  });

  it("fails for targets the Copilot SDK publishes no runtime for", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "after-pack-test-"));
    tempRoots.push(tempRoot);
    const projectDir = path.join(tempRoot, "project");
    await writeCopilotSdkFixture(projectDir, ["darwin-arm64"]);

    await expect(
      copyPackageWithDependencies(
        projectDir,
        path.join(tempRoot, "target", "node_modules"),
        "@github/copilot-sdk",
        new Set(),
        // electron-builder's Arch enum: 4 is universal.
        { target: { arch: 4, platform: "darwin" } },
      ),
    ).rejects.toThrow(/ships no runtime for darwin-4/);
  });
});

describe("prunePackagedServerPackages", () => {
  it("removes other targets' Copilot runtimes and koffi, including nested copies", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "after-pack-test-"));
    tempRoots.push(tempRoot);
    const serverRoot = path.join(tempRoot, "server");
    const nodeModulesPath = path.join(serverRoot, "node_modules");

    for (const packageName of [
      "@github/copilot-sdk",
      "@github/copilot-sdk-linux-x64",
      "@github/copilot-sdk-linux-arm64",
      "@koromix/koffi-linux-x64",
      "koffi",
      "zod",
    ]) {
      await writePackage(serverRoot, packageName, {
        name: packageName,
        version: "1.0.0",
      });
    }
    await writePackage(
      path.join(nodeModulesPath, "@github", "copilot-sdk"),
      "koffi",
      { name: "koffi", version: "3.2.1" },
    );

    await prunePackagedServerPackages({
      nodeModulesPath,
      target: { arch: 1, platform: "linux" },
    });

    expect(
      await pathExists(
        path.join(nodeModulesPath, "@github", "copilot-sdk-linux-x64"),
      ),
    ).toBe(true);
    expect(await pathExists(path.join(nodeModulesPath, "zod"))).toBe(true);
    for (const prunedPath of [
      ["@github", "copilot-sdk-linux-arm64"],
      ["@koromix", "koffi-linux-x64"],
      ["koffi"],
      ["@github", "copilot-sdk", "node_modules", "koffi"],
    ]) {
      expect(await pathExists(path.join(nodeModulesPath, ...prunedPath))).toBe(
        false,
      );
    }
  });
});

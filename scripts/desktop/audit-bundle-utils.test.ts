import { describe, expect, it } from "bun:test";
import path from "node:path";
import { createRequire } from "node:module";

import {
  findBetterSqlite3RuntimeIssues,
  findMissingServerRuntimeFiles,
  findSqliteVecRuntimeIssues,
  inferBundleArch,
} from "./audit-bundle-utils.mjs";

const require = createRequire(import.meta.url);
type CopilotTarget = { arch: number | string; platform: string };
const { findUnexpectedPackagedCopilotFiles, getExpectedPackagedCopilotFiles } =
  require("./copilot-runtime-packaging.cjs") as {
    findUnexpectedPackagedCopilotFiles: (
      options: CopilotTarget & { serverFiles: string[]; serverPath: string },
    ) => string[];
    getExpectedPackagedCopilotFiles: (
      options: CopilotTarget & { serverNodeModulesPath: string },
    ) => string[];
  };

describe("findMissingServerRuntimeFiles", () => {
  it("reports missing Copilot runtime files in the packaged server", () => {
    const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
    const serverNodeModulesPath = path.join(serverPath, "node_modules");
    const requiredFiles = getExpectedPackagedCopilotFiles({
      arch: "arm64",
      platform: "darwin",
      serverNodeModulesPath,
    });

    const missingFiles = findMissingServerRuntimeFiles({
      requiredFiles,
      serverFiles: [],
      serverPath,
    });

    const runtimeRoot = path.join(
      serverNodeModulesPath,
      "@github",
      "copilot-sdk-darwin-arm64",
    );
    expect(missingFiles).toEqual([
      path.join(
        serverNodeModulesPath,
        "@github",
        "copilot-sdk",
        "package.json",
      ),
      path.join(runtimeRoot, "package.json"),
      path.join(runtimeRoot, "prebuilds", "darwin-arm64", "copilot-runtime"),
      path.join(runtimeRoot, "prebuilds", "darwin-arm64", "runtime.node"),
    ]);
  });

  it("returns an empty list when all Copilot runtime files are present", () => {
    const serverPath = "C:/Sentinel/resources/server";
    const requiredFiles = getExpectedPackagedCopilotFiles({
      arch: "x64",
      platform: "win32",
      serverNodeModulesPath: path.join(serverPath, "node_modules"),
    });

    expect(
      requiredFiles.some((filePath) =>
        filePath.endsWith(
          path.join("prebuilds", "win32-x64", "copilot-runtime.exe"),
        ),
      ),
    ).toBe(true);
    expect(
      findMissingServerRuntimeFiles({
        requiredFiles,
        serverFiles: requiredFiles,
        serverPath,
      }),
    ).toEqual([]);
  });
});

describe("findUnexpectedPackagedCopilotFiles", () => {
  const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
  const nodeModulesPath = path.join(serverPath, "node_modules");

  it("reports other targets' runtimes and koffi once per package", () => {
    expect(
      findUnexpectedPackagedCopilotFiles({
        arch: "arm64",
        platform: "darwin",
        serverFiles: [
          path.join(nodeModulesPath, "@github", "copilot-sdk", "package.json"),
          path.join(
            nodeModulesPath,
            "@github",
            "copilot-sdk-darwin-arm64",
            "package.json",
          ),
          path.join(
            nodeModulesPath,
            "@github",
            "copilot-sdk-darwin-x64",
            "package.json",
          ),
          path.join(
            nodeModulesPath,
            "@github",
            "copilot-sdk-darwin-x64",
            "prebuilds",
            "darwin-x64",
            "runtime.node",
          ),
          path.join(nodeModulesPath, "koffi", "index.js"),
          path.join(
            nodeModulesPath,
            "@koromix",
            "koffi-darwin-arm64",
            "package.json",
          ),
          path.join(
            nodeModulesPath,
            "@github",
            "copilot-sdk",
            "node_modules",
            "zod",
            "package.json",
          ),
        ],
        serverPath,
      }),
    ).toEqual([
      "node_modules/@github/copilot-sdk-darwin-x64",
      "node_modules/@koromix/koffi-darwin-arm64",
      "node_modules/koffi",
    ]);
  });

  it("accepts a server that ships only the target runtime", () => {
    expect(
      findUnexpectedPackagedCopilotFiles({
        arch: "x64",
        platform: "linux",
        serverFiles: getExpectedPackagedCopilotFiles({
          arch: "x64",
          platform: "linux",
          serverNodeModulesPath: nodeModulesPath,
        }),
        serverPath,
      }),
    ).toEqual([]);
  });
});

describe("inferBundleArch", () => {
  it("reads the arch from electron-builder output directory names", () => {
    expect(inferBundleArch("mac-arm64")).toBe("arm64");
    expect(inferBundleArch("mac")).toBe("x64");
    expect(inferBundleArch("linux-arm64-unpacked")).toBe("arm64");
    expect(inferBundleArch("linux-unpacked")).toBe("x64");
    expect(inferBundleArch("win-unpacked")).toBe("x64");
    expect(inferBundleArch("mac-universal")).toBe("universal");
  });
});

describe("findBetterSqlite3RuntimeIssues", () => {
  const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
  const moduleRoot = path.join(serverPath, "node_modules", "better-sqlite3");

  it("accepts a runtime that only ships the target prebuild", () => {
    expect(
      findBetterSqlite3RuntimeIssues({
        arch: "arm64",
        platform: "darwin",
        serverFiles: [
          path.join(moduleRoot, "lib", "index.js"),
          path.join(moduleRoot, "package.json"),
          path.join(moduleRoot, "prebuilds", "darwin-arm64.node"),
        ],
        serverPath,
      }),
    ).toEqual([]);
  });

  it("reports a missing target prebuild, other targets and build inputs", () => {
    expect(
      findBetterSqlite3RuntimeIssues({
        arch: "x64",
        platform: "linux",
        serverFiles: [
          path.join(moduleRoot, "binding.gyp"),
          path.join(moduleRoot, "build", "Release", "better_sqlite3.node"),
          path.join(moduleRoot, "deps", "sqlite3", "sqlite3.c"),
          path.join(moduleRoot, "lib", "index.js"),
          path.join(moduleRoot, "prebuilds", "darwin-arm64.node"),
        ],
        serverPath,
      }),
    ).toEqual([
      "missing node_modules/better-sqlite3/prebuilds/linux-x64.node",
      "unexpected node_modules/better-sqlite3/prebuilds/darwin-arm64.node",
      "unexpected node_modules/better-sqlite3/binding.gyp",
      "unexpected node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      "unexpected node_modules/better-sqlite3/deps/sqlite3/sqlite3.c",
    ]);
  });

  it("reports a packaged server without better-sqlite3", () => {
    expect(
      findBetterSqlite3RuntimeIssues({
        arch: "x64",
        platform: "win32",
        serverFiles: [],
        serverPath,
      }),
    ).toEqual([
      "missing node_modules/better-sqlite3/lib/index.js",
      "missing node_modules/better-sqlite3/prebuilds/win32-x64.node",
    ]);
  });
});

describe("findSqliteVecRuntimeIssues", () => {
  const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
  const sqliteVecPackage = path.join(
    serverPath,
    "node_modules",
    "sqlite-vec",
    "package.json",
  );

  it("requires the target platform extension next to sqlite-vec", () => {
    expect(
      findSqliteVecRuntimeIssues({
        arch: "arm64",
        platform: "darwin",
        serverFiles: [sqliteVecPackage],
        serverPath,
      }),
    ).toEqual(["missing node_modules/sqlite-vec-darwin-arm64/vec0.dylib"]);

    expect(
      findSqliteVecRuntimeIssues({
        arch: "x64",
        platform: "win32",
        serverFiles: [
          sqliteVecPackage,
          path.join(
            serverPath,
            "node_modules",
            "sqlite-vec-windows-x64",
            "vec0.dll",
          ),
        ],
        serverPath,
      }),
    ).toEqual([]);
  });

  it("ignores servers that do not package sqlite-vec", () => {
    expect(
      findSqliteVecRuntimeIssues({
        arch: "x64",
        platform: "linux",
        serverFiles: [],
        serverPath,
      }),
    ).toEqual([]);
  });
});

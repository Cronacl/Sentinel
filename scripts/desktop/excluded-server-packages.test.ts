import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXCLUDED_SERVER_PACKAGE_GLOBS,
  findExcludedServerPackages,
  getNodeModulesPackageName,
  isExcludedServerPackage,
} from "./excluded-server-packages.mjs";
import { SERVER_EXTERNAL_PACKAGES } from "./server-external-packages.mjs";

const projectRoot = process.cwd();

describe("excluded server packages", () => {
  it("matches every Claude Agent SDK native CLI package and nothing else", async () => {
    const sdkPackageJson = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          "node_modules",
          "@anthropic-ai",
          "claude-agent-sdk",
          "package.json",
        ),
        "utf8",
      ),
    ) as { optionalDependencies?: Record<string, string> };
    const nativePackages = Object.keys(
      sdkPackageJson.optionalDependencies ?? {},
    );

    expect(nativePackages.length).toBeGreaterThan(0);
    expect(
      nativePackages.filter((name) => !isExcludedServerPackage(name)),
    ).toEqual([]);
    expect(isExcludedServerPackage("@anthropic-ai/claude-agent-sdk")).toBe(
      false,
    );
    expect(isExcludedServerPackage("@anthropic-ai/sdk")).toBe(false);
  });

  it("names node_modules package directories, scoped or not", () => {
    expect(getNodeModulesPackageName("/srv/node_modules", "undici")).toBe(
      "undici",
    );
    expect(
      getNodeModulesPackageName(
        "/srv/node_modules/@anthropic-ai",
        "claude-agent-sdk-darwin-arm64",
      ),
    ).toBe("@anthropic-ai/claude-agent-sdk-darwin-arm64");
    expect(
      getNodeModulesPackageName("/srv/node_modules", "@anthropic-ai"),
    ).toBeNull();
    expect(
      getNodeModulesPackageName("/srv/node_modules/undici", "lib"),
    ).toBeNull();
  });

  it("reports packaged native CLIs at any depth, once per package", () => {
    const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
    const nativeRoot = `${serverPath}/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64`;

    expect(
      findExcludedServerPackages({
        serverFiles: [
          `${serverPath}/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`,
          `${nativeRoot}/claude`,
          `${nativeRoot}/package.json`,
          `${serverPath}/node_modules/foo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`,
        ],
        serverPath,
      }),
    ).toEqual([
      "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64",
      "node_modules/foo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64",
    ]);
    expect(
      findExcludedServerPackages({
        serverFiles: [
          `${serverPath}/node_modules/@anthropic-ai/claude-agent-sdk/package.json`,
        ],
        serverPath,
      }),
    ).toEqual([]);
  });

  it("keeps the native CLIs out of output tracing and externalizes the SDK", async () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    const { default: config } = await import("../../next.config.js");

    expect(config.outputFileTracingExcludes?.["/**"]).toEqual(
      EXCLUDED_SERVER_PACKAGE_GLOBS.map(
        (packageGlob) => `./node_modules/${packageGlob}/**/*`,
      ),
    );
    expect(config.serverExternalPackages).toEqual(SERVER_EXTERNAL_PACKAGES);
    expect(SERVER_EXTERNAL_PACKAGES).toContain(
      "@anthropic-ai/claude-agent-sdk",
    );
  });

  it("prune-server deletes native CLI packages from the staged server", async () => {
    const tempProject = await mkdtemp(
      path.join(os.tmpdir(), "sentinel-prune-"),
    );
    const scopeRoot = path.join(
      tempProject,
      "desktop",
      "dist",
      "server",
      "node_modules",
      "@anthropic-ai",
    );

    try {
      for (const packageName of [
        "claude-agent-sdk",
        "claude-agent-sdk-darwin-arm64",
      ]) {
        await mkdir(path.join(scopeRoot, packageName), { recursive: true });
        await writeFile(
          path.join(scopeRoot, packageName, "package.json"),
          JSON.stringify({ name: `@anthropic-ai/${packageName}` }),
        );
      }

      const result = spawnSync(
        process.execPath,
        [path.join(projectRoot, "scripts", "desktop", "prune-server.mjs")],
        { cwd: tempProject, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect((await readdir(scopeRoot)).sort()).toEqual(["claude-agent-sdk"]);
    } finally {
      await rm(tempProject, { force: true, recursive: true });
    }
  });
});

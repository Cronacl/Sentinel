import { describe, expect, it } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

describe("desktop packaging configuration", () => {
  it("publishes macOS DMG installers and ZIP artifacts for background updates", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      build: { mac: { target: string[] } };
      scripts: Record<string, string>;
    };

    expect(packageJson.build.mac.target).toEqual(
      expect.arrayContaining(["dmg", "zip"]),
    );
    expect(packageJson.scripts["build:desktop:mac"]).toContain(
      "--target dmg,zip",
    );
    expect(packageJson.scripts["build:desktop:mac:arm64"]).toContain(
      "--target dmg,zip",
    );
    expect(packageJson.scripts["build:desktop:mac:x64"]).toContain(
      "--target dmg,zip",
    );
  });

  it("uploads macOS ZIP artifacts with release and verify workflows", async () => {
    const [publishReleaseWorkflow, desktopVerifyWorkflow] = await Promise.all([
      readFile(
        path.join(process.cwd(), ".github/workflows/publish-release.yml"),
        "utf8",
      ),
      readFile(
        path.join(process.cwd(), ".github/workflows/desktop-verify.yml"),
        "utf8",
      ),
    ]);

    expect(publishReleaseWorkflow).toContain("dist/*.zip");
    expect(desktopVerifyWorkflow).toContain('echo "dist/*.zip"');
  });

  it("stamps the macOS floor into the update feed before it is uploaded", async () => {
    const [packageScript, auditScript, publishReleaseWorkflow] =
      await Promise.all(
        [
          "scripts/desktop/package.mjs",
          "scripts/desktop/audit-bundle.mjs",
          ".github/workflows/publish-release.yml",
        ].map((file) => readFile(path.join(process.cwd(), file), "utf8")),
      );

    expect(packageScript).toContain("--publish");
    expect(packageScript).toContain('"never"');
    expect(packageScript).toContain("await stampMacUpdateFeeds(");
    expect(auditScript).toContain("findMacUpdateFeedIssues(");
    expect(publishReleaseWorkflow).toContain("dist/latest-mac.yml");
  });

  it("installs the Electron binary that electron-builder packages", async () => {
    const [packageJson, setupDesktopBuildAction] = await Promise.all([
      readFile(path.join(process.cwd(), "package.json"), "utf8").then(
        (contents) =>
          JSON.parse(contents) as {
            build: { electronDist: string };
            scripts: Record<string, string>;
          },
      ),
      readFile(
        path.join(
          process.cwd(),
          ".github/actions/setup-desktop-build/action.yml",
        ),
        "utf8",
      ),
    ]);

    expect(packageJson.build.electronDist).toBe("node_modules/electron/dist");
    expect(packageJson.scripts["electron:install"]).toBe(
      "node ./scripts/desktop/electron-binary.mjs",
    );
    expect(setupDesktopBuildAction).toContain("run: bun run electron:install");
  });
});

// bun only runs the lifecycle scripts of packages named here. better-sqlite3
// stays out: it loads bundled N-API prebuilds, and bun would otherwise run a
// no-op `node-gyp rebuild` that needs Python (and Visual Studio on Windows).
const INTENTIONALLY_UNTRUSTED = new Set(["better-sqlite3", "tesseract.js"]);

async function listPackagesWithInstallScripts(nodeModulesPath: string) {
  const packages = new Set<string>();
  const visit = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const packagePath = path.join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        await visit(packagePath);
        continue;
      }

      const manifest = await readFile(
        path.join(packagePath, "package.json"),
        "utf8",
      )
        .then(
          (contents) =>
            JSON.parse(contents) as {
              name?: string;
              scripts?: Record<string, string>;
            },
        )
        .catch(() => null);

      if (manifest?.name) {
        const scripts = manifest.scripts ?? {};
        const hasLifecycleScript = [
          "preinstall",
          "install",
          "postinstall",
        ].some((name) => Boolean(scripts[name]));
        // bun runs `node-gyp rebuild` for a binding.gyp without an install
        // script, even when the manifest sets `gypfile: false`.
        const hasImplicitGypBuild = await stat(
          path.join(packagePath, "binding.gyp"),
        )
          .then(() => true)
          .catch(() => false);

        if (hasLifecycleScript || hasImplicitGypBuild) {
          packages.add(manifest.name);
        }
      }

      await visit(path.join(packagePath, "node_modules"));
    }
  };

  await visit(nodeModulesPath);
  return packages;
}

describe("dependency lifecycle scripts", () => {
  it("trusts every installed package with install scripts except better-sqlite3", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { trustedDependencies?: string[] };
    const trusted = new Set(packageJson.trustedDependencies ?? []);
    const withScripts = await listPackagesWithInstallScripts(
      path.join(process.cwd(), "node_modules"),
    );

    expect(packageJson.trustedDependencies).toBeArray();
    expect(trusted.has("better-sqlite3")).toBe(false);
    expect(withScripts.has("better-sqlite3")).toBe(true);
    expect(
      [...withScripts]
        .filter((name) => !trusted.has(name))
        .filter((name) => !INTENTIONALLY_UNTRUSTED.has(name))
        .sort(),
    ).toEqual([]);
  });
});

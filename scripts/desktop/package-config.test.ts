import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
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

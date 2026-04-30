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
});

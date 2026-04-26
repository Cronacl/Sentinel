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
});

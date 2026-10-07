import { describe, expect, it } from "bun:test";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import {
  UNTRACED_SERVER_PACKAGE_LOADERS,
  UNTRACED_SERVER_PACKAGES,
} from "./untraced-server-packages.mjs";

// The repo declares bun modules by hand (src/types), not Bun's globals.
declare const Bun: {
  semver: { satisfies(version: string, range: string): boolean };
};

const projectRoot = process.cwd();

type PackageJson = {
  dependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  version: string;
};

async function readPackageJson(packageJsonPath: string) {
  return JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
}

// Top-level and once-nested installs; bun does not nest deeper here.
const INSTALLED_PACKAGE_GLOBS = [
  "node_modules/*/package.json",
  "node_modules/@*/*/package.json",
  "node_modules/*/node_modules/*/package.json",
  "node_modules/*/node_modules/@*/*/package.json",
  "node_modules/@*/*/node_modules/*/package.json",
  "node_modules/@*/*/node_modules/@*/*/package.json",
];

async function findInstalledDependents(
  packageName: string,
  loaderNames: readonly string[],
) {
  const dependents: Array<{ path: string; range: string }> = [];

  for await (const file of glob(INSTALLED_PACKAGE_GLOBS, {
    cwd: projectRoot,
  })) {
    const packageJson = await readPackageJson(path.join(projectRoot, file));
    if (!packageJson.name || !loaderNames.includes(packageJson.name)) continue;
    const range =
      packageJson.dependencies?.[packageName] ??
      packageJson.optionalDependencies?.[packageName];
    if (range) dependents.push({ path: file, range });
  }

  return dependents;
}

describe("untraced server packages", () => {
  it("adds every package to the standalone trace", async () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    const { default: config } = await import("../../next.config.js");

    expect(config.output).toBe("standalone");
    expect(config.outputFileTracingIncludes?.["/**"]).toEqual(
      UNTRACED_SERVER_PACKAGES.map(
        (packageName) => `./node_modules/${packageName}/**/*`,
      ),
    );
  });

  // Bundled server chunks resolve these packages from the top-level
  // node_modules, not from next to the package that requires them, so the
  // top-level copy has to satisfy every installed copy of each runtime loader.
  it("ships a top-level copy that satisfies every runtime loader", async () => {
    for (const packageName of UNTRACED_SERVER_PACKAGES) {
      const { version } = await readPackageJson(
        path.join(projectRoot, "node_modules", packageName, "package.json"),
      );
      const loaderNames =
        UNTRACED_SERVER_PACKAGE_LOADERS[
          packageName as keyof typeof UNTRACED_SERVER_PACKAGE_LOADERS
        ] ?? [];
      const dependents = await findInstalledDependents(
        packageName,
        loaderNames,
      );

      expect(dependents.length).toBeGreaterThan(0);
      expect(
        dependents.filter(
          (dependent) => !Bun.semver.satisfies(version, dependent.range),
        ),
      ).toEqual([]);
    }
  });
});

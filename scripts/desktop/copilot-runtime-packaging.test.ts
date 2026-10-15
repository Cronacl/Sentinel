import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type CopilotTarget = { arch: number | string; platform: string };
const {
  getCopilotRuntimePackageName,
  getCopilotRuntimePlatform,
  getDependencyNamesForPackage,
  getRequiredServerRuntimePackages,
  isPrunedServerPackage,
} = require("./copilot-runtime-packaging.cjs") as {
  getCopilotRuntimePackageName: (target: CopilotTarget) => string;
  getCopilotRuntimePlatform: (target: CopilotTarget) => string;
  getDependencyNamesForPackage: (options: {
    packageJson: {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    packageName: string;
    target: CopilotTarget;
  }) => string[];
  getRequiredServerRuntimePackages: () => string[];
  isPrunedServerPackage: (
    packageName: string,
    target: CopilotTarget,
  ) => boolean;
};

describe("getCopilotRuntimePlatform", () => {
  it("maps electron-builder targets to the SDK's runtime platforms", () => {
    // electron-builder's Arch enum: 1 is x64, 3 is arm64.
    expect(getCopilotRuntimePlatform({ arch: 3, platform: "darwin" })).toBe(
      "darwin-arm64",
    );
    expect(getCopilotRuntimePlatform({ arch: 1, platform: "mas" })).toBe(
      "darwin-x64",
    );
    expect(getCopilotRuntimePlatform({ arch: "x64", platform: "win32" })).toBe(
      "win32-x64",
    );
    expect(
      getCopilotRuntimePlatform({ arch: "arm64", platform: "linux" }),
    ).toBe("linux-arm64");
    expect(getCopilotRuntimePackageName({ arch: 1, platform: "linux" })).toBe(
      "@github/copilot-sdk-linux-x64",
    );
  });

  it("rejects targets without a published runtime", () => {
    expect(() =>
      getCopilotRuntimePlatform({ arch: "universal", platform: "darwin" }),
    ).toThrow(/ships no runtime/);
    expect(() =>
      getCopilotRuntimePlatform({ arch: "x64", platform: "freebsd" }),
    ).toThrow(/ships no runtime/);
  });
});

describe("getDependencyNamesForPackage", () => {
  it("keeps only the target runtime and drops koffi for the installed SDK", async () => {
    const packageJson = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "node_modules",
          "@github",
          "copilot-sdk",
          "package.json",
        ),
        "utf8",
      ),
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    expect(getRequiredServerRuntimePackages()).toEqual(["@github/copilot-sdk"]);
    // The installed SDK no longer pulls in the @github/copilot CLI package.
    expect(Object.keys(packageJson.dependencies ?? {})).not.toContain(
      "@github/copilot",
    );
    expect(
      getDependencyNamesForPackage({
        packageJson,
        packageName: "@github/copilot-sdk",
        target: { arch: "x64", platform: "linux" },
      }).sort(),
    ).toEqual(
      [
        "@github/copilot-sdk-linux-x64",
        ...Object.keys(packageJson.dependencies ?? {}).filter(
          (dependencyName) => dependencyName !== "koffi",
        ),
      ].sort(),
    );
  });

  it("leaves other packages' dependencies alone", () => {
    expect(
      getDependencyNamesForPackage({
        packageJson: {
          dependencies: { "builder-util-runtime": "9.0.0" },
          optionalDependencies: { koffi: "3.2.1" },
        },
        packageName: "electron-updater",
        target: { arch: "arm64", platform: "darwin" },
      }),
    ).toEqual(["builder-util-runtime", "koffi"]);
  });
});

describe("isPrunedServerPackage", () => {
  it("prunes other runtimes and koffi but keeps the SDK and target runtime", () => {
    const target = { arch: "arm64", platform: "darwin" };

    expect(isPrunedServerPackage("@github/copilot-sdk", target)).toBe(false);
    expect(
      isPrunedServerPackage("@github/copilot-sdk-darwin-arm64", target),
    ).toBe(false);
    expect(
      isPrunedServerPackage("@github/copilot-sdk-darwin-x64", target),
    ).toBe(true);
    expect(
      isPrunedServerPackage("@github/copilot-sdk-linuxmusl-arm64", target),
    ).toBe(true);
    expect(isPrunedServerPackage("koffi", target)).toBe(true);
    expect(isPrunedServerPackage("@koromix/koffi-darwin-arm64", target)).toBe(
      true,
    );
    expect(isPrunedServerPackage("zod", target)).toBe(false);
  });
});

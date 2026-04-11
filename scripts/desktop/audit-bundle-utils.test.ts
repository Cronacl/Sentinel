import { describe, expect, it } from "bun:test";
import path from "node:path";
import { createRequire } from "node:module";

import { findMissingServerRuntimeFiles } from "./audit-bundle-utils.mjs";

const require = createRequire(import.meta.url);
const { getExpectedPackagedCopilotFiles } =
  require("./copilot-runtime-packaging.cjs") as {
    getExpectedPackagedCopilotFiles: (options: {
      serverNodeModulesPath: string;
    }) => string[];
  };

describe("findMissingServerRuntimeFiles", () => {
  it("reports missing Copilot runtime files in the packaged server", () => {
    const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
    const serverNodeModulesPath = path.join(serverPath, "node_modules");
    const requiredFiles = getExpectedPackagedCopilotFiles({
      serverNodeModulesPath,
    });

    const missingFiles = findMissingServerRuntimeFiles({
      requiredFiles,
      serverFiles: [],
      serverPath,
    });

    expect(missingFiles).toEqual([
      path.join(
        serverNodeModulesPath,
        "@github",
        "copilot-sdk",
        "package.json",
      ),
    ]);
  });

  it("returns an empty list when all Copilot runtime files are present", () => {
    const serverPath = "/tmp/Sentinel.app/Contents/Resources/server";
    const requiredFiles = getExpectedPackagedCopilotFiles({
      serverNodeModulesPath: path.join(serverPath, "node_modules"),
    });

    const missingFiles = findMissingServerRuntimeFiles({
      requiredFiles,
      serverFiles: requiredFiles,
      serverPath,
    });

    expect(missingFiles).toEqual([]);
  });
});

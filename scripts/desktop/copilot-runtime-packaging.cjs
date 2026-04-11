"use strict";

const path = require("node:path");

const COPILOT_SDK_PACKAGE = "@github/copilot-sdk";
const COPILOT_BUNDLED_CLI_PACKAGE = "@github/copilot";

/**
 * @returns {string[]}
 */
function getRequiredServerRuntimePackages() {
  return [COPILOT_SDK_PACKAGE];
}

/**
 * @param {{
 *   packageJson: {
 *     dependencies?: Record<string, string>;
 *     optionalDependencies?: Record<string, string>;
 *   };
 *   packageName: string;
 * }} options
 */
function getDependencyNamesForPackage({ packageJson, packageName }) {
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];

  if (packageName === COPILOT_SDK_PACKAGE) {
    return dependencyNames.filter(
      (dependencyName) => dependencyName !== COPILOT_BUNDLED_CLI_PACKAGE,
    );
  }

  return dependencyNames;
}

/**
 * @param {{ serverNodeModulesPath: string }} options
 */
function getExpectedPackagedCopilotFiles({ serverNodeModulesPath }) {
  return [
    path.join(serverNodeModulesPath, "@github", "copilot-sdk", "package.json"),
  ];
}

module.exports = {
  getDependencyNamesForPackage,
  getExpectedPackagedCopilotFiles,
  getRequiredServerRuntimePackages,
};

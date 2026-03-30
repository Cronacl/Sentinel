import { execFileSync } from "node:child_process";

const stableVersion = process.argv[2];
const commitish = process.argv[3] ?? "HEAD";

if (!stableVersion) {
  throw new Error("Expected a stable version argument.");
}

if (!/^\d+\.\d+\.\d+$/.test(stableVersion)) {
  throw new Error(
    `Expected a stable version like 1.2.3, received "${stableVersion}".`,
  );
}

const readGitFile = (filePath) =>
  execFileSync("git", ["show", `${commitish}:${filePath}`], {
    encoding: "utf8",
  });

const packageJson = JSON.parse(readGitFile("package.json"));
const manifest = JSON.parse(readGitFile(".release-please-manifest.json"));
const changelog = readGitFile("CHANGELOG.md");

if (packageJson.version !== stableVersion) {
  throw new Error(
    `package.json version ${packageJson.version} does not match ${stableVersion}.`,
  );
}

if (manifest["."] !== stableVersion) {
  throw new Error(
    `Manifest version ${manifest["."]} does not match ${stableVersion}.`,
  );
}

if (!changelog.includes(`## [${stableVersion}]`)) {
  throw new Error(
    `CHANGELOG.md does not contain an entry for ${stableVersion}.`,
  );
}

console.log(
  `[release] validated stable promotion state for v${stableVersion} at ${commitish}`,
);

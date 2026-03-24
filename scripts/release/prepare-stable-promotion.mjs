import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const alphaTag = process.argv[2];
const stableVersion = process.argv[3];

if (!alphaTag) {
  throw new Error("Expected the source alpha tag as the first argument.");
}

if (!stableVersion) {
  throw new Error("Expected the target stable version as the second argument.");
}

const alphaTagMatch = alphaTag.match(/^v(\d+\.\d+\.\d+)-alpha\.(\d+)$/);

if (!alphaTagMatch) {
  throw new Error(
    `Expected an alpha tag like v1.2.3-alpha.4, received "${alphaTag}".`,
  );
}

if (!/^\d+\.\d+\.\d+$/.test(stableVersion)) {
  throw new Error(
    `Expected a stable version like 1.2.3, received "${stableVersion}".`,
  );
}

const alphaVersion = alphaTagMatch[1];

if (alphaVersion !== stableVersion) {
  throw new Error(
    `Stable version ${stableVersion} must match the alpha tag base version ${alphaVersion}.`,
  );
}

const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const alphaHead = execFileSync("git", ["rev-parse", alphaTag], {
  encoding: "utf8",
}).trim();

if (alphaHead !== currentHead) {
  throw new Error(
    `${alphaTag} does not point at the current main HEAD. Use the workflow only for the latest approved alpha cut, or prepare an older stable promotion on a dedicated branch manually.`,
  );
}

const packageJsonUrl = new URL("../../package.json", import.meta.url);
const manifestUrl = new URL(
  "../../.release-please-manifest.json",
  import.meta.url,
);
const changelogUrl = new URL("../../CHANGELOG.md", import.meta.url);

const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const changelog = await readFile(changelogUrl, "utf8");
const alphaVersionLabel = `${stableVersion}-alpha.${alphaTagMatch[2]}`;

if (packageJson.version !== alphaVersionLabel) {
  throw new Error(
    `package.json version ${packageJson.version} does not match ${alphaVersionLabel} from ${alphaTag}.`,
  );
}

if (manifest["."] !== alphaVersionLabel) {
  throw new Error(
    `Manifest version ${manifest["."]} does not match ${alphaVersionLabel} from ${alphaTag}.`,
  );
}

if (!changelog.includes(`## [${alphaVersionLabel}]`)) {
  throw new Error(
    `CHANGELOG.md does not contain an entry for ${alphaVersionLabel}.`,
  );
}

packageJson.version = stableVersion;
manifest["."] = stableVersion;

await writeFile(packageJsonUrl, `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  changelogUrl,
  changelog.replace(`## [${alphaVersionLabel}]`, `## [${stableVersion}]`),
);

console.log(
  `[release] prepared a stable promotion from ${alphaTag} to v${stableVersion}.`,
);

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const releaseTag = process.argv[2];
const outputPath = process.argv[3];

if (!releaseTag) {
  throw new Error("Expected a release tag argument.");
}

if (!outputPath) {
  throw new Error("Expected an output path argument.");
}

const version = releaseTag.startsWith("v") ? releaseTag.slice(1) : releaseTag;
const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
const changelog = await readFile(changelogPath, "utf8");
const lines = changelog.split("\n");
const sectionHeader = `## [${version}]`;
const startIndex = lines.findIndex((line) => line.startsWith(sectionHeader));

if (startIndex === -1) {
  throw new Error(`CHANGELOG.md does not contain an entry for ${version}.`);
}

let endIndex = lines.length;
for (let index = startIndex + 1; index < lines.length; index += 1) {
  if (lines[index].startsWith("## [")) {
    endIndex = index;
    break;
  }
}

const sectionBody = lines
  .slice(startIndex + 1, endIndex)
  .join("\n")
  .trim();
const body = `## ${releaseTag}\n\n${sectionBody}\n`;
await writeFile(outputPath, body, "utf8");

console.log(`[release] wrote release notes for ${releaseTag} to ${outputPath}`);

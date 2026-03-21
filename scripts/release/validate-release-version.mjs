import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const releaseTag = process.argv[2];

if (!releaseTag) {
  throw new Error("Expected a release tag argument.");
}

const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const expectedTag = `v${packageJson.version}`;

if (releaseTag !== expectedTag) {
  throw new Error(
    `Release tag mismatch: expected ${expectedTag} from package.json, received ${releaseTag}.`,
  );
}

console.log(
  `[release] validated ${releaseTag} against package version ${packageJson.version}`,
);

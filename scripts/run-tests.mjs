import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TEST_FILE_PATTERN = /\.test\.(?:[cm]?[jt]sx?)$/;
const ROOTS = ["desktop", "src"];

function collectTestFiles(root) {
  const entries = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      entries.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      entries.push(path.resolve(fullPath));
    }
  }

  return entries;
}

function resolveBunCommand() {
  return process.platform === "win32" ? "bun.exe" : "bun";
}

const testFiles = ROOTS.flatMap((root) => {
  try {
    if (!statSync(root).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  return collectTestFiles(root);
}).sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  console.error("No test files were found under desktop/ or src/.");
  process.exit(1);
}

const bunCommand = resolveBunCommand();

for (const testFile of testFiles) {
  const result = spawnSync(bunCommand, ["test", testFile], {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

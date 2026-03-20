import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const serverRoot = path.join(projectRoot, "desktop", "dist", "server");
const nodeModulesRoot = path.join(serverRoot, "node_modules");

const PRUNE_DIRS = new Set([
  "__tests__",
  "test",
  "tests",
  "docs",
  "doc",
  "example",
  "examples",
  ".github",
  ".vscode",
  ".idea",
]);

const PRUNE_FILES_EXACT = new Set([
  "tsconfig.json",
  "tsconfig.build.json",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".eslintrc.cjs",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  ".prettierrc.cjs",
  ".editorconfig",
  ".npmignore",
  ".gitattributes",
  "jest.config.js",
  "jest.config.ts",
  "jest.config.cjs",
  "jest.config.mjs",
  "vitest.config.ts",
  "vitest.config.js",
  "Makefile",
  "Gruntfile.js",
  "Gulpfile.js",
  ".travis.yml",
  "appveyor.yml",
  ".coveralls.yml",
  ".babelrc",
]);

const PRUNE_FILE_PATTERNS = [
  /^README/i,
  /^CHANGELOG/i,
  /^HISTORY/i,
  /^CONTRIBUTING/i,
  /^AUTHORS/i,
  /\.map$/,
  /\.ts$/,
];

function shouldPruneDir(name) {
  return PRUNE_DIRS.has(name);
}

function shouldPruneFile(name) {
  if (PRUNE_FILES_EXACT.has(name)) return true;
  if (name.endsWith(".d.ts")) return false;
  return PRUNE_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

let removedCount = 0;

async function pruneDirectory(dirPath) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (shouldPruneDir(entry.name)) {
        await rm(fullPath, { force: true, recursive: true });
        removedCount++;
      } else {
        await pruneDirectory(fullPath);
      }
    } else if (entry.isFile() && shouldPruneFile(entry.name)) {
      await rm(fullPath, { force: true });
      removedCount++;
    }
  }
}

try {
  await stat(nodeModulesRoot);
} catch {
  console.warn("[desktop] server node_modules not found, skipping prune.");
  process.exit(0);
}

console.log("[desktop] pruning server node_modules…");
await pruneDirectory(nodeModulesRoot);
console.log(`[desktop] pruned ${removedCount} entries from server node_modules.`);

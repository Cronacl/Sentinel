import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_FILE_PATTERN = /\.test\.(?:[cm]?[jt]sx?)$/;
const ROOTS = ["desktop", "scripts", "src"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".next"]);

function parseArgs(argv) {
  const options = { bail: false, filters: [], jobs: 1 };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--bail") {
      options.bail = true;
    } else if (arg === "--jobs" || arg === "-j") {
      options.jobs = Math.max(
        1,
        Number.parseInt(argv[++index] ?? "1", 10) || 1,
      );
    } else if (arg.startsWith("--jobs=")) {
      options.jobs = Math.max(1, Number.parseInt(arg.slice(7), 10) || 1);
    } else if (arg === "--filter") {
      const value = argv[++index];
      if (value) options.filters.push(value);
    } else if (arg.startsWith("--filter=")) {
      options.filters.push(arg.slice(9));
    } else {
      options.filters.push(arg);
    }
  }

  return options;
}

function collectTestFiles(root) {
  const entries = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        entries.push(...collectTestFiles(fullPath));
      }
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

// Each test file runs in its own bun process (mock.module is process-global)
// with its own throwaway Sentinel state, so files never share or touch the
// developer's real ~/.sentinel data.
function runTestFile(testFile, { captureOutput }) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "sentinel-test-"));
  const env = {
    ...process.env,
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? "1",
    SENTINEL_SKIP_STARTUP_TASKS: process.env.SENTINEL_SKIP_STARTUP_TASKS ?? "1",
    SENTINEL_STATE_PATH: path.join(stateRoot, "state.json"),
    SENTINEL_DB_PATH: path.join(stateRoot, "sentinel.db"),
    SENTINEL_MEDIA_PATH: path.join(stateRoot, "media"),
  };

  return new Promise((resolve) => {
    const child = spawn(resolveBunCommand(), ["test", testFile], {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const chunks = [];

    if (captureOutput) {
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", (chunk) => chunks.push(chunk));
    }

    const finish = (status) => {
      rmSync(stateRoot, { force: true, recursive: true });
      resolve({
        output: Buffer.concat(chunks).toString("utf8"),
        status,
        testFile,
      });
    };

    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code ?? 1));
  });
}

const options = parseArgs(process.argv.slice(2));

const testFiles = ROOTS.flatMap((root) => {
  try {
    if (!statSync(root).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  return collectTestFiles(root);
})
  .filter(
    (file) =>
      options.filters.length === 0 ||
      options.filters.some((filter) =>
        path.relative(process.cwd(), file).includes(filter),
      ),
  )
  .sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  console.error(
    `No test files were found under ${ROOTS.join("/, ")}/${
      options.filters.length > 0
        ? ` matching ${options.filters.join(", ")}`
        : ""
    }.`,
  );
  process.exit(1);
}

const captureOutput = options.jobs > 1;
const failures = [];
let nextIndex = 0;
let stopped = false;

async function worker() {
  while (!stopped && nextIndex < testFiles.length) {
    const testFile = testFiles[nextIndex++];
    const result = await runTestFile(testFile, { captureOutput });

    if (captureOutput) {
      process.stdout.write(result.output);
    }

    if (result.status !== 0) {
      failures.push(result.testFile);
      if (options.bail) {
        stopped = true;
      }
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(options.jobs, testFiles.length) }, () =>
    worker(),
  ),
);

const relative = (file) => path.relative(process.cwd(), file);

if (failures.length > 0) {
  console.error(
    `\n${failures.length} of ${testFiles.length} test files failed:\n${failures
      .map((file) => `  - ${relative(file)}`)
      .join("\n")}`,
  );
  process.exit(1);
}

console.log(`\nAll ${testFiles.length} test files passed.`);

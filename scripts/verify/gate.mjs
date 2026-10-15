// Runs the verification gates used for every revival commit.
//   G0: frozen install, typecheck, tests, format check, tripwires
//   G1: G0 + production Next build
//   G2: G1 + unsigned macOS desktop package (includes the bundle audit)
// Usage: node scripts/verify/gate.mjs [G0|G1|G2] [--jobs N]
import { spawnSync } from "node:child_process";

const level = (process.argv[2] ?? "G0").toUpperCase();
const jobsIndex = process.argv.indexOf("--jobs");
const jobs = jobsIndex > -1 ? process.argv[jobsIndex + 1] : "4";
const bun = process.platform === "win32" ? "bun.exe" : "bun";

const steps = [
  ["install", bun, ["install", "--frozen-lockfile"]],
  ["typecheck", bun, ["run", "typecheck"]],
  ["tests", "node", ["scripts/run-tests.mjs", "--jobs", jobs]],
  ["format", bun, ["run", "format:check"]],
  ["tripwires", "node", ["scripts/verify/tripwires.mjs"]],
];

if (level === "G1" || level === "G2") {
  steps.push(["build", bun, ["run", "build"]]);
}
if (level === "G2") {
  steps.push(["package", bun, ["run", "build:desktop:mac"]]);
}

for (const [name, command, args] of steps) {
  const startedAt = Date.now();
  console.log(`\n▶ ${level} ${name}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { shell: false, stdio: "inherit" });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.status !== 0) {
    console.error(`\n✖ ${level} failed at ${name} after ${seconds}s`);
    process.exit(result.status ?? 1);
  }

  console.log(`✔ ${name} (${seconds}s)`);
}

console.log(`\n✔ ${level} passed`);

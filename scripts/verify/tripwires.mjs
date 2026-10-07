// Forbidden-pattern registry for the dependency revival. Each tripwire guards
// against a pattern that a completed migration phase removed; it must stay at
// zero hits from then on. Run: node scripts/verify/tripwires.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * @typedef {{
 *   id: string;
 *   description: string;
 *   pattern: RegExp;
 *   include?: RegExp;
 *   exclude?: RegExp;
 * }} Tripwire
 */

/** @type {Tripwire[]} */
export const TRIPWIRES = [];

const DEFAULT_EXCLUDE =
  /(^|\/)(CHANGELOG\.md|bun\.lock)$|^scripts\/verify\/tripwires\.mjs$/;

function listTrackedFiles() {
  return execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

export function findTripwireHits(tripwires = TRIPWIRES) {
  const files = listTrackedFiles();
  const hits = [];

  for (const file of files) {
    if (DEFAULT_EXCLUDE.test(file)) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const tripwire of tripwires) {
      if (tripwire.include && !tripwire.include.test(file)) continue;
      if (tripwire.exclude?.test(file)) continue;
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (tripwire.pattern.test(line)) {
          hits.push({
            file,
            id: tripwire.id,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }
  }

  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findTripwireHits();

  if (hits.length > 0) {
    for (const hit of hits) {
      console.error(`${hit.file}:${hit.line} [${hit.id}] ${hit.text}`);
    }
    console.error(`\n${hits.length} tripwire hit(s).`);
    process.exit(1);
  }

  console.log(`Tripwires clean (${TRIPWIRES.length} active).`);
}

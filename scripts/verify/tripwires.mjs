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
export const TRIPWIRES = [
  {
    id: "P1-node-21",
    description: "Node 21.7.3 pin replaced by Node 24 LTS",
    pattern: /21\.7\.3/,
  },
  {
    id: "P3-zod-v3-error-params",
    description: "zod 4 replaced invalid_type_error/required_error with error",
    pattern: /\b(?:invalid_type_error|required_error)\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P3-zod-single-arg-record",
    description: "zod 4 z.record() needs an explicit key schema",
    // One argument: no top-level comma before the closing parenthesis. Lines
    // are matched one at a time with up to two nested parenthesis levels, so
    // multi-line or deeper calls slip through; typecheck is the main guard
    // (zod 4 types record() with a required value schema, checkJs included).
    pattern: /(?:\bz|^\s*)\.record\((?:[^(),]|\((?:[^()]|\([^()]*\))*\))*\)/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P3-zod-type-any",
    description: "zod 4 removed ZodTypeAny (use z.ZodType)",
    pattern: /\bZodTypeAny\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P4-tsconfig-baseUrl",
    description: "baseUrl is deprecated in TypeScript 6 (paths are relative)",
    pattern: /"baseUrl"/,
    include: /(^|\/)tsconfig[^/]*\.json$/,
  },
  {
    id: "P7-ai-step-count-is",
    description: "AI SDK 7 renamed stepCountIs to isStepCount",
    pattern: /\bstepCountIs\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-experimental-context",
    description:
      "AI SDK 7 removed experimental_context (use runtimeContext or toolsContext)",
    pattern: /\bexperimental_context\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-experimental-repair-tool-call",
    description:
      "AI SDK 7 renamed experimental_repairToolCall to repairToolCall",
    pattern: /\bexperimental_repairToolCall\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-shared-v3-provider-options",
    description:
      "SharedV3ProviderOptions is tied to provider spec V3 (use ProviderOptions)",
    pattern: /\bSharedV3ProviderOptions\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-generate-object",
    description:
      "AI SDK 7 deprecated generateObject (use generateText with Output.object)",
    pattern: /\bgenerateObject\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-experimental-transcribe",
    description: "AI SDK 7 renamed experimental_transcribe to transcribe",
    pattern: /\bexperimental_transcribe\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-on-step-finish",
    description: "AI SDK 7 renamed onStepFinish to onStepEnd",
    pattern: /\bonStepFinish\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-create-google-generative-ai",
    description:
      "@ai-sdk/google 4 renamed createGoogleGenerativeAI to createGoogle",
    pattern: /\bcreateGoogleGenerativeAI\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P7-ai-v4-tool-result-shape",
    description:
      "Tool results carry .output since AI SDK 5 (the AI SDK 4 .result shape)",
    // One line at a time: `toolResult(s)` followed by `.result`, or
    // `result.result` when iterating over step.toolResults.
    pattern: /\btoolResults?\b.*\.result\b|\bresult\??\.result\b/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P5-next-turbo-flag",
    description: "Turbopack is the Next 16 dev default; --turbo is redundant",
    pattern: /--turbo\b/,
    include: /^(package\.json|scripts\/.*\.(c|m)?js|\.github\/.*\.ya?ml)$/,
  },
  {
    id: "P5-next-eslint-config",
    description: "Next 16 removed the eslint key from next.config",
    pattern: /(^|[{,\s])"?eslint"?\s*[:,}]/,
    include: /^next\.config\.(c|m)?(j|t)s$/,
  },
  {
    id: "P6-32-bit-arch",
    description: "Electron 44 publishes no ia32 or armv7l binaries",
    pattern: /\b(?:armv7l|ia32)\b/,
    include: /^(?:scripts\/desktop\/|\.github\/|package\.json$)/,
  },
  {
    id: "P6-prebuild-install",
    description:
      "better-sqlite3 13 bundles N-API prebuilds; no prebuild-install",
    pattern: /prebuild-install/,
    include: /^scripts\//,
  },
  {
    id: "P6-electron-skip-binary-download",
    description:
      "Electron 42+ ignores ELECTRON_SKIP_BINARY_DOWNLOAD; the binary comes from electron:install",
    pattern: /ELECTRON_SKIP_BINARY_DOWNLOAD/,
  },
  {
    id: "P6-unawaited-clipboard-write",
    description: "Electron 44 clipboard.writeText returns a Promise",
    pattern: /(?<!await )\bclipboard\.writeText\(/,
    include: /^desktop\/main\//,
  },
  {
    id: "P6-positional-console-message",
    description:
      "console-message listeners read the details object (Electron 35+)",
    pattern: /\(\s*_?event\s*,\s*level\s*,\s*message\b/,
    include: /^desktop\//,
  },
];

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

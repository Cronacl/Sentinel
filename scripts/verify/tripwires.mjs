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
 *   multiline?: boolean;
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
    id: "P8-invalid-helper-model-ids",
    description:
      "Helper-model ids must exist: Bedrock Claude Haiku 4.5 is us.anthropic.claude-haiku-4-5-20251001-v1:0 and Ollama has no bare llama3 entry",
    pattern: /anthropic\.claude-haiku-4-5-v1["'`]|\bollama:\s*["']llama3["']/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
  },
  {
    id: "P8-retired-image-catalog-ids",
    description:
      "@ai-sdk/google 4 serves only Gemini image models and OpenAI shut DALL-E down; retired ids belong in RETIRED_IMAGE_MODEL_REPLACEMENTS",
    pattern: /\bid:\s*["'](?:imagen-|dall-e-)/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
  },
  {
    id: "P8-bedrock-in-region-claude-ids",
    description:
      "Current Claude models have no in-region (on-demand) Bedrock endpoint; list them under an inference profile id such as us.anthropic.*",
    pattern: /\bid:\s*["']anthropic\.claude-/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
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
    id: "P6-unawaited-clipboard",
    description:
      "Electron 44 clipboard read/write/has calls return Promises; await them",
    pattern:
      /(?<!\b(?:await|return)\s+)\bclipboard\.(?:has|read|readText|write|writeText)\(/,
    include: /^desktop\/main\//,
  },
  {
    id: "P6-removed-clipboard-api",
    description:
      "Electron 44 removed the HTML, image, RTF, bookmark, buffer and find-text clipboard methods",
    pattern:
      /\bclipboard\.(?:availableFormats|(?:read|write)(?:Bookmark|Buffer|FindText|HTML|Image|RTF))\b/,
    include: /^desktop\//,
  },
  {
    id: "P6-renderer-clipboard",
    description:
      "Electron 44 removed clipboard from renderers; the preload goes through IPC",
    pattern:
      /\{[^}]*\bclipboard\b[^}]*\}\s*(?:=\s*require\(\s*["']electron["']\s*\)|from\s*["']electron["'])|require\(\s*["']electron["']\s*\)\.clipboard\b/,
    include: /^desktop\/preload\//,
    multiline: true,
  },
  {
    id: "P6-positional-console-message",
    description:
      "console-message listeners read the details object (Electron 35+)",
    pattern:
      /["']console-message["']\s*,\s*(?:async\s+)?(?:function\b[^(]*)?\(\s*[\w$]+\s*,|\(\s*_?(?:e|evt|event)\s*,\s*(?:level|lvl)\s*,\s*(?:message|msg)\b/,
    include: /^desktop\//,
    multiline: true,
  },
  {
    id: "P9-claude-synthetic-question-answer",
    description:
      "Claude AskUserQuestion answers go through canUseTool updatedInput.answers, not a synthetic tool_use_result user message",
    pattern:
      /\bbuildClaudeQuestionResponse\b|tool_use_result:\s*\{\s*action:\s*["']accept["']/,
    include: /^src\/lib\/ai\/chat\/runtime\/claude/,
    multiline: true,
  },
  {
    id: "P9-claude-todowrite-only-renderers",
    description:
      "Claude Agent SDK 0.3 replaced TodoWrite with the Task* tools; register claude_task* renderers alongside claude_todowrite",
    // claude_todowrite with no claude_taskcreate anywhere in the file. The
    // lookarounds run only where the literal matches.
    pattern:
      /\bclaude_todowrite\s*:(?<!\bclaude_taskcreate\s*:[\s\S]*)(?![\s\S]*\bclaude_taskcreate\s*:)/,
    include: /^src\/components\/chat\/message-parts\/tool\/registry\.ts$/,
    multiline: true,
  },
  {
    id: "P9-claude-sdk-env-fallback",
    description:
      "Agent SDK options.env replaces process.env since 0.2.113; merge it in (buildClaudeSdkEnv)",
    pattern: /\benv\s*\?\?\s*process\.env\b/,
    include: /^src\/lib\/ai\/chat\/(?:engines\/claude-sdk|runtime\/claude)/,
  },
  {
    id: "P9-claude-bare-cli-spawn",
    description:
      "Run the resolved Claude Code binary (resolveClaudeCodeRuntime), not `claude` from PATH",
    pattern: /\b(?:exec|execFile|spawn)\(\s*["']claude["']/,
    include: /^src\//,
  },
  {
    id: "P9-claude-preapproved-search-tools",
    description:
      "Claude SDK base options must not name Grep/Glob: allowedTools pre-approves them, skipping canUseTool for searches outside the workspace",
    pattern: /["'](?:Grep|Glob)["']/,
    include: /^src\/lib\/ai\/chat\/engines\/claude-sdk\//,
  },
  {
    id: "P9-claude-commit-skip-permissions",
    description:
      'Commit-message generation runs Claude Code with no tools (--tools "", dontAsk), never --dangerously-skip-permissions',
    pattern: /--dangerously-skip-permissions/,
    include: /^src\/lib\/git\//,
    exclude: /\.test\.[cm]?[jt]sx?$/,
  },
  {
    id: "P9-copilot-client-cli-options",
    description:
      "Copilot SDK 1.x removed cliPath/cliUrl/autoStart/cwd client options (use RuntimeConnection and workingDirectory)",
    // A CopilotClient options literal: `new CopilotClient({ ... })` up to its
    // first parenthesis, or a value typed as CopilotClientOptions up to the
    // end of its statement.
    pattern:
      /(?:new\s+CopilotClient\s*\(\s*\{[^)]*?|:\s*CopilotClientOptions\s*(?:=\s*)?\{[^;]*?)\b(?:autoStart|cliPath|cliUrl|cwd)\s*:/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
    multiline: true,
  },
  {
    id: "P9-copilot-auto-start",
    description:
      "Copilot SDK 1.x starts the runtime on first use; autoStart is gone",
    pattern: /\bautoStart\b/,
    include:
      /^src\/lib\/(?:ai\/chat\/(?:engines\/copilot-sdk|runtime\/copilot)\b|git\/commit-message\.ts$)/,
  },
  {
    id: "P9-copilot-legacy-permission-results",
    description:
      "Copilot SDK 1.x permission handlers answer approve-once/reject/user-not-available; the denied-* and approved kinds are outcomes",
    pattern: /\bkind:\s*["'](?:approved|denied-[a-z-]+)["']/,
    include:
      /^src\/lib\/(?:ai\/chat\/(?:engines\/copilot-sdk|runtime\/copilot)\b|git\/commit-message\.ts$)/,
  },
  {
    id: "P9-copilot-cli-package",
    description:
      "Copilot SDK 1.x bundles its runtime in @github/copilot-sdk-<platform>; the @github/copilot CLI package is not a dependency",
    pattern: /"@github\/copilot"\s*:/,
    include: /^package\.json$/,
  },
  {
    id: "P9-copilot-persisted-cli-path",
    description:
      "SENTINEL_COPILOT_PATH saved in desktop.env ranks after the bundled Copilot runtime; Sentinel must not write it (a saved path would demote an explicit override)",
    pattern: /setLocalRuntimeEnvValue\(\s*["']SENTINEL_COPILOT_PATH["']/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
    multiline: true,
  },
  {
    id: "P9-copilot-message-overwrite",
    description:
      "Copilot SDK 1.x splits one response into several assistant.message chunks; mirror them with applyCopilotAssistantMessage instead of overwriting the text",
    pattern: /state\.text\s*=\s*event\.data\.content\b/,
    include: /^src\/lib\/ai\/chat\/runtime\/copilot\//,
  },
  {
    id: "P9-opencode-ready-prefix",
    description:
      "OpenCode readiness parses whole lines loosely and polls /global/health instead of a strict stdout prefix",
    pattern:
      /\bOPENCODE_SERVER_READY_PREFIX\b|startsWith\(\s*["'`]opencode server listening/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
  },
  {
    id: "P9-codex-thread-rollback",
    description:
      "Codex 0.156+ removed thread/rollback (use thread/turns/list + thread/revert)",
    pattern: /["']thread\/rollback["']/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P9-acp-session-cancel-request",
    description:
      "ACP session/cancel is a notification; never send it as a request",
    pattern: /\b(?:call|request)\(\s*["']session\/cancel["']/,
    include: /\.[cm]?[jt]sx?$/,
  },
  {
    id: "P9-codex-config-write-params",
    description:
      "Codex 0.160 config writes take keyPath/mergeStrategy and edits[], not key or values",
    pattern:
      /["']config\/(?:value\/write|batchWrite)["']\s*,\s*\{\s*(?:key|values)\b/,
    // App code only: the tripwire's own tests quote the old shape.
    include: /^src\/.*\.[cm]?[jt]sx?$/,
    multiline: true,
  },
  {
    id: "P10-next-middleware-file",
    description:
      "Next 16 renamed middleware to proxy; the /api loopback guard lives in src/proxy.ts and a middleware file would be ignored or conflict",
    pattern: /[\s\S]/,
    include: /^(?:src\/)?middleware\.[cm]?[jt]s$/,
  },
  {
    id: "P10-loopback-guard-forwarded-host",
    description:
      "The loopback guard trusts only the Host header; pages can set X-Forwarded-Host freely",
    pattern: /x-forwarded-host/i,
    include: /^src\/(?:proxy\.ts|server\/http\/)/,
    exclude: /\.test\.[cm]?[jt]sx?$/,
  },
  {
    id: "P10-hardcoded-thread-state-keys",
    description:
      "chat_engine_state merges generically (state/registry.ts); a hard-coded driver key list drops permissionModeOverride and unknown drivers",
    pattern: /!\s*next\.(?:claude|codex|copilot|cursor|opencode)\b/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
  },
  {
    id: "P10-env-runtime-path-keys-frozen",
    description:
      "src/env.js runtime path keys are frozen to the legacy engines; new drivers persist resolved binaries in <state root>/engines/runtime-paths.json (platform/runtime/paths-cache.ts)",
    pattern:
      /\bSENTINEL_(?!(?:CODEX|CLAUDE|COPILOT|CURSOR|OPENCODE|DB|STATE|MEDIA)_PATH\b)[A-Z0-9_]+_PATH\b/,
    include: /^src\/env\.js$/,
  },
  {
    id: "P10-runtime-env-binary-path-write",
    description:
      "Only the legacy engines write SENTINEL_<X>_PATH to desktop.env; new code records resolved binaries per instance in runtime-paths.json",
    pattern:
      // SENTINEL_COPILOT_PATH has its own P9 tripwire.
      /\bsetLocalRuntimeEnvValue\(\s*["'`]SENTINEL_(?!(?:CODEX|CLAUDE|COPILOT|CURSOR|OPENCODE)_PATH["'`])[A-Z0-9_]+_PATH["'`]/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
    exclude: /\.test\.[cm]?[jt]sx?$/,
    multiline: true,
  },
  {
    id: "P10-engine-local-with-timeout",
    description:
      "Engines time out through src/lib/runtime/process/with-timeout.ts, whose timeout aborts the work (kills the probe's child); local copies leaked it",
    pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+withTimeout\b/,
    include: /^src\/lib\/ai\/chat\/(?:engines|runtime)\/.*\.[cm]?[jt]sx?$/,
    exclude: /\.test\.[cm]?[jt]sx?$/,
  },
  {
    id: "P10-windows-tree-kill-copy",
    description:
      "Process trees end through src/lib/runtime/process/kill-tree.ts (process groups on POSIX, taskkill /T /F on Windows)",
    pattern: /\binstallWindowsTreeKill\b|\bfunction\s+runWindowsTaskkill\b/,
    include: /^src\/.*\.[cm]?[jt]sx?$/,
  },
  {
    id: "P10-engine-windows-shell-spawn",
    description:
      "Agent processes start through spawnManagedProcess, which runs .cmd shims via cmd.exe with quoted arguments; shell: true on Windows passes them unescaped",
    pattern: /\bshell:\s*process\.platform\s*===\s*["']win32["']/,
    include: /^src\/lib\/ai\/chat\/(?:engines|runtime)\/.*\.[cm]?[jt]sx?$/,
    exclude: /\.test\.[cm]?[jt]sx?$/,
  },
  {
    id: "P10-engine-local-binary-discovery",
    description:
      "Engines discover binaries through platform/runtime (resolve-binary.ts, login-shell.ts, version-probe.ts); per-engine copies of PATH search and login-shell lookup drifted apart",
    pattern:
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(?:findExecutableInPath|getExecutableNames|buildPosixShellLookupScript|buildFishShellLookupScript|buildLoginShellLookupArgs|getManagedPathValue|isPersistable[A-Za-z]*Path)\b/,
    include: /^src\/lib\/ai\/chat\/engines\/.*\.[cm]?[jt]sx?$/,
    exclude:
      /^src\/lib\/ai\/chat\/engines\/platform\/runtime\/|\.test\.[cm]?[jt]sx?$/,
  },
  {
    id: "fixtures-in-app-code",
    description:
      "scripts/fixtures protocol fakes are test-only; app code never references them",
    pattern: /\bscripts\/fixtures\//,
    include: /^(?:src|desktop)\/.*\.[cm]?[jt]sx?$/,
    // Engine tests spawn the fixtures, and their helpers may live next to them.
    exclude: /\.test\.[cm]?[jt]sx?$|(?:^|\/)__(?:fixtures|tests)__\//,
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

/**
 * @param {string} file
 * @param {string} content
 * @param {Tripwire[]} [tripwires]
 */
export function findTripwireHitsInContent(
  file,
  content,
  tripwires = TRIPWIRES,
) {
  const hits = [];
  const lines = content.split("\n");

  for (const tripwire of tripwires) {
    if (tripwire.include && !tripwire.include.test(file)) continue;
    if (tripwire.exclude?.test(file)) continue;

    if (tripwire.multiline) {
      // Multiline patterns span line breaks; report the line a match starts on.
      const flags = tripwire.pattern.flags.replace("g", "");
      for (const match of content.matchAll(
        new RegExp(tripwire.pattern.source, `${flags}g`),
      )) {
        const line = content.slice(0, match.index).split("\n").length;
        hits.push({
          file,
          id: tripwire.id,
          line,
          text: (lines[line - 1] ?? "").trim(),
        });
      }
      continue;
    }

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

  return hits;
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

    hits.push(...findTripwireHitsInContent(file, content, tripwires));
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

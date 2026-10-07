import { describe, expect, it } from "bun:test";

import { findTripwireHitsInContent } from "./tripwires.mjs";

function hitIds(file: string, content: string) {
  return findTripwireHitsInContent(file, content).map(
    (hit: { id: string; line: number }) => `${hit.id}:${hit.line}`,
  );
}

describe("P6 Electron 44 tripwires", () => {
  it("flags clipboard calls that drop the Promise or use removed methods", () => {
    const content = [
      "clipboard.writeText(text);",
      "const value = clipboard.readText();",
      "if (clipboard.has('text/plain')) {}",
      "clipboard.writeHTML(html);",
      "const image = clipboard.readImage();",
      "clipboard.availableFormats();",
    ].join("\n");

    expect(hitIds("desktop/main/index.mjs", content)).toEqual([
      "P6-unawaited-clipboard:1",
      "P6-unawaited-clipboard:2",
      "P6-unawaited-clipboard:3",
      "P6-removed-clipboard-api:4",
      "P6-removed-clipboard-api:5",
      "P6-removed-clipboard-api:6",
    ]);
  });

  it("accepts awaited or returned clipboard Promises", () => {
    const content = [
      "await clipboard.writeText(text);",
      "const value = await clipboard.readText();",
      "return clipboard.read();",
    ].join("\n");

    expect(hitIds("desktop/main/index.mjs", content)).toEqual([]);
    // The renderer's navigator.clipboard is out of scope.
    expect(
      hitIds(
        "src/components/copy-button.tsx",
        "navigator.clipboard.writeText(text);",
      ),
    ).toEqual([]);
  });

  it("flags Electron clipboard imports in the preload", () => {
    expect(
      hitIds(
        "desktop/preload/index.mjs",
        'import {\n  clipboard,\n  contextBridge,\n} from "electron";',
      ),
    ).toEqual(["P6-renderer-clipboard:1"]);
    expect(
      hitIds(
        "desktop/preload/index.mjs",
        'const text = require("electron").clipboard.readText();',
      ),
    ).toEqual(["P6-renderer-clipboard:1"]);
    expect(
      hitIds(
        "desktop/preload/index.mjs",
        'import { contextBridge, ipcRenderer } from "electron";\nconst api = {\n  clipboard: {\n    writeText: (text) => ipcRenderer.invoke("copy", text),\n  },\n};',
      ),
    ).toEqual([]);
  });

  it("flags positional console-message listeners across line breaks", () => {
    expect(
      hitIds(
        "desktop/main/index.mjs",
        'win.webContents.on(\n  "console-message",\n  (e, lvl, msg, line, source) => {},\n);',
      ),
    ).toEqual(["P6-positional-console-message:2"]);
    expect(
      hitIds(
        "desktop/main/index.mjs",
        'contents.on("console-message", function (_event, level) {});',
      ),
    ).toEqual(["P6-positional-console-message:1"]);
    expect(
      hitIds(
        "desktop/main/index.mjs",
        "function onConsoleMessage(_event, level, message) {}",
      ),
    ).toEqual(["P6-positional-console-message:1"]);
  });

  it("accepts the details-object console-message form", () => {
    expect(
      hitIds(
        "desktop/main/index.mjs",
        'win.webContents.on(\n  "console-message",\n  ({ level, lineNumber, message, sourceId }) => {},\n);\ncontents.on("console-message", (event) => log(event.message));',
      ),
    ).toEqual([]);
  });
});

describe("P8 model catalog tripwires", () => {
  it("flags the invalid helper-model ids fixed in the P8 catalog refresh", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/tools/selection/model.ts",
        '  amazon_bedrock: "anthropic.claude-haiku-4-5-v1",\n  ollama: "llama3",',
      ),
    ).toEqual([
      "P8-invalid-helper-model-ids:1",
      "P8-invalid-helper-model-ids:2",
    ]);
    expect(
      hitIds(
        "src/lib/ai/chat/title/model.ts",
        '  amazon_bedrock: "us.anthropic.claude-haiku-4-5-20251001-v1:0",\n  ollama: "llama3.2",',
      ),
    ).toEqual([]);
  });

  it("flags retired image models listed as catalog entries", () => {
    expect(
      hitIds(
        "src/lib/ai/providers/images.ts",
        [
          '      id: "imagen-4.0-generate-001",',
          '      id: "dall-e-3",',
          '    "dall-e-3": "gpt-image-2",',
          '          modelId: "imagen-3.0-generate-002",',
          '      id: "gemini-nano-banana-2.1",',
        ].join("\n"),
      ),
    ).toEqual([
      "P8-retired-image-catalog-ids:1",
      "P8-retired-image-catalog-ids:2",
    ]);
  });
});

describe("P9 Claude Agent SDK tripwires", () => {
  it("flags the synthetic AskUserQuestion answer message", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/runtime/claude/run.ts",
        [
          "function buildClaudeQuestionResponse(input) {",
          "  return {",
          "    tool_use_result: {",
          '      action: "accept",',
          "      answers: { response: input.response },",
          "    },",
          "  };",
          "}",
        ].join("\n"),
      ),
    ).toEqual([
      "P9-claude-synthetic-question-answer:1",
      "P9-claude-synthetic-question-answer:3",
    ]);
    expect(
      hitIds(
        "src/lib/ai/chat/runtime/claude/permissions.ts",
        'return { behavior: "allow", updatedInput: { ...toolInput, answers } };',
      ),
    ).toEqual([]);
  });

  it("flags Claude renderers that handle TodoWrite without the Task* tools", () => {
    const registry = "src/components/chat/message-parts/tool/registry.ts";

    expect(
      hitIds(
        registry,
        "const claudeRenderers = {\n  claude_todoread: ClaudeTodoWriteTool,\n  claude_todowrite: ClaudeTodoWriteTool,\n};",
      ),
    ).toEqual(["P9-claude-todowrite-only-renderers:3"]);
    expect(
      hitIds(
        registry,
        "const claudeRenderers = {\n  claude_taskcreate: ClaudeTaskTool,\n  claude_todowrite: ClaudeTodoWriteTool,\n};",
      ),
    ).toEqual([]);
  });

  it("flags Claude SDK env built from process.env only as a fallback", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/engines/claude-sdk/index.ts",
        "const baseEnv = options?.env ?? process.env;",
      ),
    ).toEqual(["P9-claude-sdk-env-fallback:1"]);
    expect(
      hitIds(
        "src/lib/ai/chat/engines/claude-sdk/index.ts",
        "const mergedEnv = { ...process.env, ...env };",
      ),
    ).toEqual([]);
  });

  it("flags spawning `claude` from PATH", () => {
    expect(
      hitIds(
        "src/lib/git/commit-message.ts",
        'spawn("claude", args, { cwd, env });',
      ),
    ).toEqual(["P9-claude-bare-cli-spawn:1"]);
    expect(
      hitIds(
        "src/lib/git/commit-message.ts",
        "spawn(launch.command, launch.args, { cwd });",
      ),
    ).toEqual([]);
  });
});

describe("P9 Copilot SDK 1.x tripwires", () => {
  const engineFile = "src/lib/ai/chat/engines/copilot-sdk/index.ts";

  it("flags the removed client options in CopilotClient literals", () => {
    expect(
      hitIds(
        engineFile,
        "return new CopilotClient({\n  autoStart: false,\n  ...(path ? { cliPath: path } : {}),\n  cwd: process.cwd(),\n});",
      ),
    ).toEqual(["P9-copilot-client-cli-options:1", "P9-copilot-auto-start:2"]);
    expect(
      hitIds(
        "src/lib/other.ts",
        "const options: CopilotClientOptions = {\n  logLevel: 'error',\n  cliUrl: 'localhost:3000',\n};",
      ),
    ).toEqual(["P9-copilot-client-cli-options:1"]);
  });

  it("accepts RuntimeConnection-based options and cliPath status fields", () => {
    expect(
      hitIds(
        engineFile,
        [
          "function build(): CopilotClientOptions {",
          "  return {",
          "    clientInfo: { applicationName: 'sentinel' },",
          "    connection: RuntimeConnection.forStdio({ path: runtime.cliPath }),",
          "    workingDirectory: process.cwd(),",
          "  };",
          "}",
          "const client = new CopilotClient(build());",
          "const status = { cliPath: runtime.cliPath, cliVersion: null };",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("flags legacy permission results and the CLI package dependency", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/runtime/copilot/run.ts",
        'resolve({ kind: "approved" });\nreturn { kind: "denied-interactively-by-user", feedback };\nreturn { kind: "approve-once" };',
      ),
    ).toEqual([
      "P9-copilot-legacy-permission-results:1",
      "P9-copilot-legacy-permission-results:2",
    ]);
    expect(
      hitIds(
        "package.json",
        '    "@github/copilot": "^1.0.24",\n    "@github/copilot-sdk": "^1.0.16",',
      ),
    ).toEqual(["P9-copilot-cli-package:1"]);
  });

  it("flags a written SENTINEL_COPILOT_PATH and overwritten assistant text", () => {
    expect(
      hitIds(
        engineFile,
        'await setLocalRuntimeEnvValue(\n  "SENTINEL_COPILOT_PATH",\n  command,\n);\nawait setLocalRuntimeEnvValue("SENTINEL_CODEX_PATH", command);\nconst saved = await readLocalRuntimeEnvValue("SENTINEL_COPILOT_PATH");',
      ),
    ).toEqual(["P9-copilot-persisted-cli-path:1"]);
    expect(
      hitIds(
        "src/lib/ai/chat/runtime/copilot/run.ts",
        "control.state.text = event.data.content ?? control.state.text;\napplyCopilotAssistantMessage(control.state, event.data);",
      ),
    ).toEqual(["P9-copilot-message-overwrite:1"]);
  });
});

describe("P9 OpenCode tripwires", () => {
  it("flags the strict stdout readiness prefix", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/engines/opencode-sdk/index.ts",
        'const OPENCODE_SERVER_READY_PREFIX = "opencode server listening";\nif (!line.startsWith("opencode server listening")) continue;',
      ),
    ).toEqual(["P9-opencode-ready-prefix:1", "P9-opencode-ready-prefix:2"]);
  });

  it("accepts the loose readiness pattern", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/engines/opencode-sdk/index.ts",
        "const OPENCODE_SERVER_READY_PATTERN = /server listening on\\s+(https?:\\/\\/\\S+)/i;",
      ),
    ).toEqual([]);
  });
});

describe("P9 Codex tripwires", () => {
  it("flags pre-0.160 config write params across line breaks", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/engines/codex-app-server/index.ts",
        'await this.call("config/value/write", {\n  key,\n  value,\n});\nawait this.call("config/batchWrite", { values });',
      ),
    ).toEqual([
      "P9-codex-config-write-params:1",
      "P9-codex-config-write-params:5",
    ]);
  });

  it("accepts the keyPath/mergeStrategy and edits[] shapes", () => {
    expect(
      hitIds(
        "src/lib/ai/chat/engines/codex-app-server/index.ts",
        'await this.call("config/value/write", {\n  keyPath,\n  mergeStrategy,\n  value,\n});\nawait this.call("config/batchWrite", {\n  edits: [],\n});',
      ),
    ).toEqual([]);
  });
});

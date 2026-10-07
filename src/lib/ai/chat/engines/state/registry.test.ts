import { describe, expect, it } from "bun:test";

import { BUILTIN_DRIVER_KINDS } from "../contract/ids";
import { DRIVER_CATALOG } from "../catalog";
import {
  getClaudeThreadState,
  getCodexThreadState,
  getCursorThreadState,
} from "../types";
import {
  RESERVED_THREAD_STATE_KEYS,
  THREAD_STATE_BINDINGS,
  buildThreadChatEngineState,
  getDriverThreadState,
  getThreadPermissionMode,
  getThreadStateBinding,
  isThreadStateForInstance,
  mergeThreadChatEngineState,
  parseThreadChatEngineState,
  stampThreadState,
} from "./registry";

const defaultCodex = {
  continuationKey: "codex:instance:codex",
  id: "codex",
  isDefault: true,
};
const workCodex = {
  continuationKey: "codex:home:/Users/me/.codex-work",
  id: "codex-work",
  isDefault: false,
};

describe("THREAD_STATE_BINDINGS", () => {
  it("binds every external builtin driver to its own key", () => {
    for (const kind of BUILTIN_DRIVER_KINDS) {
      const binding = getThreadStateBinding(kind);

      if (DRIVER_CATALOG[kind].runtime === "builtin") {
        expect(binding).toBeNull();
        continue;
      }

      expect(binding?.key).toBe(kind);
    }
  });

  it("never binds a reserved key", () => {
    for (const binding of Object.values(THREAD_STATE_BINDINGS)) {
      expect(RESERVED_THREAD_STATE_KEYS).not.toContain(binding.key as never);
    }
  });

  it("does not resolve prototype keys", () => {
    expect(getThreadStateBinding("constructor")).toBeNull();
    expect(getThreadStateBinding("__proto__")).toBeNull();
  });
});

describe("legacy thread state", () => {
  it("parses rows written before instances and keeps the named getters", () => {
    const raw = {
      claude: { permissionMode: "plan", sessionId: "claude-1" },
      codex: { codexThreadId: "codex-thread-1", reasoningEffort: "high" },
      cursor: { cwd: "/repo", modelId: "auto", sessionId: "cursor-1" },
    };

    expect(getCodexThreadState(raw)).toEqual({
      codexThreadId: "codex-thread-1",
      reasoningEffort: "high",
    });
    expect(getClaudeThreadState(raw)).toEqual({
      permissionMode: "plan",
      sessionId: "claude-1",
    });
    expect(getCursorThreadState(raw)).toEqual({
      cwd: "/repo",
      modelId: "auto",
      sessionId: "cursor-1",
    });
  });

  it("reads one driver's entry even when another entry is malformed", () => {
    const raw = {
      claude: { cwd: "/repo" },
      codex: { codexThreadId: "codex-thread-1" },
    };

    expect(parseThreadChatEngineState(raw)).toBeNull();
    expect(getCodexThreadState(raw)).toEqual({
      codexThreadId: "codex-thread-1",
    });
    expect(getClaudeThreadState(raw)).toBeNull();
  });

  it("returns null for non-object values", () => {
    for (const raw of [null, undefined, "x", 3, []]) {
      expect(getDriverThreadState("codex", raw)).toBeNull();
    }
    expect(getDriverThreadState("gemini", { gemini: { sessionId: "g" } })).toBe(
      null,
    );
  });
});

describe("continuation keys", () => {
  it("accepts unstamped legacy state only on the default instance", () => {
    const raw = { codex: { codexThreadId: "codex-thread-1" } };

    expect(getDriverThreadState("codex", raw, defaultCodex)).toEqual({
      codexThreadId: "codex-thread-1",
    });
    expect(getDriverThreadState("codex", raw, workCodex)).toBeNull();
  });

  it("continues stamped state only under the same continuation key", () => {
    const stamped = stampThreadState(
      { codexThreadId: "codex-thread-1" },
      workCodex,
    );
    const raw = buildThreadChatEngineState("codex", stamped);

    expect(stamped).toEqual({
      codexThreadId: "codex-thread-1",
      continuationKey: "codex:home:/Users/me/.codex-work",
      instanceId: "codex-work",
    });
    expect(getDriverThreadState("codex", raw, workCodex)).toEqual(stamped);
    expect(getDriverThreadState("codex", raw, defaultCodex)).toBeNull();
    // Another instance pointing at the same home may continue the session.
    expect(
      getDriverThreadState("codex", raw, {
        ...workCodex,
        id: "codex-work-2",
      }),
    ).toEqual(stamped);
  });

  it("rejects legacy state that names a different instance", () => {
    expect(
      isThreadStateForInstance({ instanceId: "codex-work" }, defaultCodex),
    ).toBe(false);
    expect(
      isThreadStateForInstance({ instanceId: "codex" }, defaultCodex),
    ).toBe(true);
  });
});

describe("mergeThreadChatEngineState", () => {
  it("keeps permissionModeOverride when no driver or repo state is set", () => {
    expect(
      mergeThreadChatEngineState(null, { permissionModeOverride: "full" }),
    ).toEqual({ permissionModeOverride: "full" });
    expect(
      mergeThreadChatEngineState(
        { permissionModeOverride: "full" },
        buildThreadChatEngineState("codex", null),
      ),
    ).toEqual({ codex: null, permissionModeOverride: "full" });
    expect(getThreadPermissionMode({ permissionModeOverride: "full" })).toBe(
      "full",
    );
  });

  it("keeps state of drivers this build does not know", () => {
    expect(
      mergeThreadChatEngineState(
        { gemini: { sessionId: "gemini-1" } },
        { repo: { activeBranch: "main" } },
      ),
    ).toEqual({
      gemini: { sessionId: "gemini-1" },
      repo: { activeBranch: "main" },
    });
  });

  it("returns null once every key is empty", () => {
    expect(
      mergeThreadChatEngineState(
        { codex: { codexThreadId: "codex-thread-1" } },
        buildThreadChatEngineState("codex", null),
      ),
    ).toBeNull();
    expect(mergeThreadChatEngineState(null, null)).toBeNull();
  });
});

describe("buildThreadChatEngineState", () => {
  it("keys registered and unknown drivers by kind", () => {
    expect(
      buildThreadChatEngineState("pi", { sessionPath: "/tmp/s.jsonl" }),
    ).toEqual({ pi: { sessionPath: "/tmp/s.jsonl" } });
    expect(buildThreadChatEngineState("gemini", { sessionId: "g" })).toEqual({
      gemini: { sessionId: "g" },
    });
  });

  it("refuses the reserved keys", () => {
    expect(() => buildThreadChatEngineState("repo", {})).toThrow();
    expect(() =>
      buildThreadChatEngineState("permissionModeOverride", "full"),
    ).toThrow();
  });
});

describe("new driver state schemas", () => {
  it("round-trips ACP, Pi and OpenCode v2 state through the top-level schema", () => {
    const raw = {
      acp: {
        agentId: "gemini",
        configValues: { model: "gemini-3-pro", thinking: true },
        continuationKey: "acp:gemini:instance:acp-gemini",
        historyDelivered: true,
        instanceId: "acp-gemini",
        protocolVersion: 1,
        sessionId: "acp-1",
      },
      grok: { modeId: "default", sessionId: "grok-1" },
      opencode: { generation: "v2", sessionId: "ses_1" },
      pi: { modelId: "anthropic/claude", sessionPath: "/tmp/pi.jsonl" },
    };

    expect(parseThreadChatEngineState(raw)).toEqual(raw);
  });
});

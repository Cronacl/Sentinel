import { describe, expect, it } from "bun:test";

import {
  buildThreadChatEngineState,
  mergeThreadChatEngineState,
  parseThreadChatEngineState,
} from "./types";

describe("mergeThreadChatEngineState", () => {
  it("preserves codex state when repo metadata is updated", () => {
    expect(
      mergeThreadChatEngineState(
        buildThreadChatEngineState("codex", {
          codexThreadId: "codex-thread-1",
        }),
        {
          repo: {
            lastPullRequest: {
              base: "main",
              createdAt: "2026-03-28T10:00:00.000Z",
              draft: false,
              head: "feature/test",
              kind: "compare",
              repoFullName: "openai/sentinel",
              url: "https://github.com/openai/sentinel/compare/main...feature/test",
            },
          },
        },
      ),
    ).toEqual({
      codex: {
        codexThreadId: "codex-thread-1",
      },
      repo: {
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T10:00:00.000Z",
          draft: false,
          head: "feature/test",
          kind: "compare",
          repoFullName: "openai/sentinel",
          url: "https://github.com/openai/sentinel/compare/main...feature/test",
        },
      },
    });
  });

  it("preserves repo metadata when codex state is cleared", () => {
    expect(
      mergeThreadChatEngineState(
        {
          codex: {
            codexThreadId: "codex-thread-1",
          },
          repo: {
            lastPullRequest: {
              base: "main",
              createdAt: "2026-03-28T10:00:00.000Z",
              draft: true,
              head: "feature/test",
              kind: "github",
              number: 42,
              repoFullName: "openai/sentinel",
              state: "open",
              title: "Ship feature",
              updatedAt: "2026-03-28T10:05:00.000Z",
              url: "https://github.com/openai/sentinel/pull/42",
            },
          },
        },
        buildThreadChatEngineState("codex", null),
      ),
    ).toEqual({
      codex: null,
      repo: {
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T10:00:00.000Z",
          draft: true,
          head: "feature/test",
          kind: "github",
          number: 42,
          repoFullName: "openai/sentinel",
          state: "open",
          title: "Ship feature",
          updatedAt: "2026-03-28T10:05:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      },
    });
  });
  it("preserves Copilot state when repo metadata is updated", () => {
    expect(
      mergeThreadChatEngineState(
        buildThreadChatEngineState("copilot", {
          cwd: "/tmp/project",
          modelId: "gpt-5",
          reasoningEffort: "medium",
          sessionId: "copilot-session-1",
        }),
        {
          repo: {
            activeBranch: "feature/copilot",
          },
        },
      ),
    ).toEqual({
      copilot: {
        cwd: "/tmp/project",
        modelId: "gpt-5",
        reasoningEffort: "medium",
        sessionId: "copilot-session-1",
      },
      repo: {
        activeBranch: "feature/copilot",
      },
    });
  });

  it("preserves Cursor state when repo metadata is updated", () => {
    expect(
      mergeThreadChatEngineState(
        buildThreadChatEngineState("cursor", {
          cwd: "/tmp/project",
          modelId: "gpt-5.4",
          reasoningEffort: "medium",
          sessionId: "cursor-session-1",
        }),
        {
          repo: {
            activeBranch: "feature/cursor",
          },
        },
      ),
    ).toEqual({
      cursor: {
        cwd: "/tmp/project",
        modelId: "gpt-5.4",
        reasoningEffort: "medium",
        sessionId: "cursor-session-1",
      },
      repo: {
        activeBranch: "feature/cursor",
      },
    });
  });

  it("preserves OpenCode state when repo metadata is updated", () => {
    expect(
      mergeThreadChatEngineState(
        buildThreadChatEngineState("opencode", {
          cwd: "/tmp/project",
          modelId: "anthropic/claude-sonnet-4-5",
          selectedAgent: "build",
          selectedVariant: "high",
          sessionId: "opencode-session-1",
        }),
        {
          repo: {
            activeBranch: "feature/opencode",
          },
        },
      ),
    ).toEqual({
      opencode: {
        cwd: "/tmp/project",
        modelId: "anthropic/claude-sonnet-4-5",
        selectedAgent: "build",
        selectedVariant: "high",
        sessionId: "opencode-session-1",
      },
      repo: {
        activeBranch: "feature/opencode",
      },
    });
  });

  it("parses expanded reasoning efforts for runtime thread state", () => {
    expect(
      parseThreadChatEngineState({
        codex: {
          codexThreadId: "codex-thread-1",
          reasoningEffort: "xhigh",
        },
        copilot: {
          reasoningEffort: "none",
          sessionId: "copilot-session-1",
        },
        cursor: {
          reasoningEffort: "medium",
          sessionId: "cursor-session-1",
        },
        opencode: {
          modelId: "openai/gpt-5",
          selectedAgent: "build",
          selectedVariant: "medium",
          sessionId: "opencode-session-1",
        },
      }),
    ).toEqual({
      codex: {
        codexThreadId: "codex-thread-1",
        reasoningEffort: "xhigh",
      },
      copilot: {
        reasoningEffort: "none",
        sessionId: "copilot-session-1",
      },
      cursor: {
        reasoningEffort: "medium",
        sessionId: "cursor-session-1",
      },
      opencode: {
        modelId: "openai/gpt-5",
        selectedAgent: "build",
        selectedVariant: "medium",
        sessionId: "opencode-session-1",
      },
    });
  });
});

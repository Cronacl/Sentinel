import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "../prompt-context";
import { getDefaultToolApprovalPolicies } from "../tool-approval-policy";
import { buildSystemPrompt } from "./system-prompt-builder";

function createPromptContext(memoryPromptLines: string[] = []) {
  return buildThreadPromptContext({
    availableSkills: [],
    enabledIntegrations: [],
    enabledMcpServers: [],
    mcpToolNames: [],
    memoryPromptLines,
    memorySettings: {
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: false,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 6,
    },
    permissionMode: "default",
    planSummary: null,
    searchProviders: {},
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    skillRoots: [],
    sourceMessageId: null,
    threadMode: "chat",
    toolApprovalPolicies: getDefaultToolApprovalPolicies(),
    webFetchSettings: {
      batchEnabled: false,
      batchLimit: 10,
    },
    workspaceRoot: "/tmp/workspace",
  });
}

describe("buildSystemPrompt", () => {
  it("renders the richer coding-first prompt in the expected section order", () => {
    const prompt = buildSystemPrompt({
      personalization: "Default personality: Prioritize direct answers.",
      promptContext: createPromptContext([
        "[Global] preference: Prefers concise answers.",
      ]),
    });

    expect(prompt).toContain("## Identity");
    expect(prompt).toContain("## Application Context");
    expect(prompt).toContain("## Core Operating Model");
    expect(prompt).toContain("## Response Discipline");
    expect(prompt).toContain("## Context Priorities");
    expect(prompt).toContain("## Research Discipline");
    expect(prompt).toContain("## General Task Handling");
    expect(prompt).toContain("## Autonomy");
    expect(prompt).toContain("## Tool Calling Discipline");
    expect(prompt).toContain("## Mutation Discipline");
    expect(prompt).toContain("## Git Safety");
    expect(prompt).toContain("## Capability Boundaries");
    expect(prompt).toContain("## Memory");
    expect(prompt).toContain("## Personalization");

    expect(prompt.indexOf("## Identity")).toBeLessThan(
      prompt.indexOf("## Application Context"),
    );
    expect(prompt.indexOf("## Application Context")).toBeLessThan(
      prompt.indexOf("## Core Operating Model"),
    );
    expect(prompt.indexOf("## Core Operating Model")).toBeLessThan(
      prompt.indexOf("## Response Discipline"),
    );
    expect(prompt.indexOf("## Context Priorities")).toBeLessThan(
      prompt.indexOf("## Research Discipline"),
    );
    expect(prompt).toContain("coding-first workspace agent");
    expect(prompt).toContain("present yourself simply as Sentinel");
    expect(prompt).toContain("Only act on tools, permissions, and integrations");
    expect(prompt).toContain("Prefer primary sources, official documentation");
    expect(prompt).toContain(
      "avoid unnecessary tool use when the request can be answered directly",
    );
    expect(prompt).toContain(
      "Do not stop to ask for confirmation when the user has already made the goal clear",
    );
    expect(prompt).toContain(
      "Do not ask the user for optional tool parameters unless they materially change the outcome",
    );
    expect(prompt).toContain("Never create commits unless the user explicitly asks for a commit");
    expect(prompt).toContain("[Global] preference: Prefers concise answers.");
  });

  it("omits optional memory and personalization sections when empty", () => {
    const prompt = buildSystemPrompt({
      personalization: "",
      promptContext: createPromptContext(),
    });

    expect(prompt).not.toContain("## Memory");
    expect(prompt).not.toContain("## Personalization");
  });
});

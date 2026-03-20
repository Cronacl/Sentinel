import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "../prompt-context";
import { getDefaultToolApprovalPolicies } from "../tool-approval-policy";
import { buildSystemPrompt } from "./system-prompt-builder";

function createPromptContext(memoryPromptLines: string[] = []) {
  return buildThreadPromptContext({
    allowedInspectionRoots: ["/tmp/workspace"],
    allowedMutationRoot: "/tmp/workspace",
    availableSkills: [],
    enabledIntegrations: [],
    enabledMcpServers: [],
    latestUserText: "Inspect the workspace and fix the issue.",
    latentToolSummary: {
      categories: [],
      integrationNamespaces: [],
      mcpNamespaces: [],
    },
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
    preferredProjectRoot: "/tmp/workspace",
    projectCandidates: [],
    searchProviders: {},
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    shellStartDirectory: "/tmp/workspace",
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
    expect(prompt).toContain("## Mission And Operating Stance");
    expect(prompt).toContain("## Proactive Execution Standard");
    expect(prompt).toContain("## Evidence And Inspection Discipline");
    expect(prompt).toContain("## Tool Exploitation Discipline");
    expect(prompt).toContain("## Approval And Permission Semantics");
    expect(prompt).toContain("## Failure Recovery And Remediation");
    expect(prompt).toContain("## Validation And Completion Standard");
    expect(prompt).toContain("## Communication Discipline");
    expect(prompt).toContain("## Capability Boundaries");
    expect(prompt).toContain("## Memory");
    expect(prompt).toContain("## Personalization");

    expect(prompt.indexOf("## Identity")).toBeLessThan(
      prompt.indexOf("## Mission And Operating Stance"),
    );
    expect(prompt.indexOf("## Mission And Operating Stance")).toBeLessThan(
      prompt.indexOf("## Proactive Execution Standard"),
    );
    expect(prompt.indexOf("## Proactive Execution Standard")).toBeLessThan(
      prompt.indexOf("## Evidence And Inspection Discipline"),
    );
    expect(prompt.indexOf("## Tool Exploitation Discipline")).toBeLessThan(
      prompt.indexOf("## Approval And Permission Semantics"),
    );
    expect(prompt).toContain("coding-first workspace agent");
    expect(prompt).toContain("present yourself simply as Sentinel");
    expect(prompt).toContain("Approval-required tools are still available capabilities");
    expect(prompt).toContain(
      "missing binaries, missing toolchains, and `command not found` failures as environment-remediation problems",
    );
    expect(prompt).toContain("Go above and beyond by bundling obvious follow-through work");
    expect(prompt).toContain(
      "Do not stop to ask for confirmation when the user has already made the goal clear",
    );
    expect(prompt).toContain(
      "Do not claim shell, package-manager, or install actions are impossible",
    );
    expect(prompt).toContain(
      "you may invoke host-installed package managers and toolchains such as brew, apt-get, npm, pnpm, yarn, bun, cargo, or pip",
    );
    expect(prompt).toContain(
      "When a discovered skill is a clear match for the request, call load_skill before relying on general reasoning or bundled resources.",
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

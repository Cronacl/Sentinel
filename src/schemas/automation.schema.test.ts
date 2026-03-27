import { describe, expect, it } from "bun:test";

import { createAutomationSchema } from "./automation.schema";

const validAutomation = {
  modelId: "openai:gpt-5.2",
  prompt: "Review the codebase.",
  reasoningEffort: "medium" as const,
  scheduleTime: "09:00",
  scheduleType: "daily" as const,
  title: "Daily review",
  workspaceId: "workspace-1",
};

describe("createAutomationSchema", () => {
  it("rejects model ids without a provider prefix", () => {
    const result = createAutomationSchema.safeParse({
      ...validAutomation,
      modelId: "gpt-5.2",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("provider:model");
  });

  it("allows raw codex model ids for codex automations", () => {
    const result = createAutomationSchema.safeParse({
      ...validAutomation,
      chatEngine: "codex",
      modelId: "gpt-5.4",
    });

    expect(result.success).toBe(true);
  });

  it("allows raw Claude model ids for Claude automations", () => {
    const result = createAutomationSchema.safeParse({
      ...validAutomation,
      chatEngine: "claude",
      modelId: "claude-sonnet-4-5-20250929",
    });

    expect(result.success).toBe(true);
  });

  it("requires both weekly day and time", () => {
    const result = createAutomationSchema.safeParse({
      ...validAutomation,
      scheduleDayOfWeek: null,
      scheduleTime: null,
      scheduleType: "weekly",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["scheduleDayOfWeek", "scheduleTime"]),
    );
  });

  it("rejects malformed custom cron expressions", () => {
    const result = createAutomationSchema.safeParse({
      ...validAutomation,
      scheduleCron: "every day at nine",
      scheduleTime: null,
      scheduleType: "custom",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["scheduleCron"]);
  });
});

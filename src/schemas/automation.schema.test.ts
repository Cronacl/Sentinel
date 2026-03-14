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

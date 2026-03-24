import { describe, expect, it } from "bun:test";

import { buildActiveThreadMessages } from "./branches";

describe("buildActiveThreadMessages", () => {
  it("repairs legacy Codex assistant siblings into a linear turn", () => {
    const createdAt = new Date("2026-03-24T10:00:00.000Z");
    const records = [
      {
        createdAt,
        id: "db-user-1",
        messageId: "user-1",
        metadata: {
          branchId: "user-1",
          isActive: true,
          parentMessageId: null,
          runId: "run-1",
          status: "completed",
        },
        parts: [{ text: "hey", type: "text" }],
        role: "user" as const,
        updatedAt: createdAt,
      },
      {
        createdAt: new Date("2026-03-24T10:00:01.000Z"),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {
          branchId: "assistant-1",
          isActive: true,
          parentMessageId: null,
          runId: "run-1",
          status: "completed",
        },
        parts: [{ text: "Hey.", type: "text" }],
        role: "assistant" as const,
        updatedAt: new Date("2026-03-24T10:00:01.000Z"),
      },
    ];

    const transcript = buildActiveThreadMessages(records);

    expect(transcript).toHaveLength(2);
    expect(transcript[0]?.id).toBe("user-1");
    expect(transcript[0]?.metadata?.branchOptions).toBeUndefined();
    expect(transcript[1]?.id).toBe("assistant-1");
    expect(transcript[1]?.metadata?.parentMessageId).toBe("user-1");
    expect(transcript[1]?.metadata?.branchOptions).toBeUndefined();
  });
});

import { describe, expect, it } from "bun:test";

import {
  threadCreateSchema,
  threadUIMessageSchema,
  workspaceCreateSchema,
} from "./workspace-thread.schema";

describe("threadCreateSchema", () => {
  it("fills engine, mode and summary defaults", () => {
    expect(threadCreateSchema.parse({ title: " Draft " })).toEqual({
      engine: "sentinel",
      mode: "chat",
      summary: "",
      title: "Draft",
    });
  });

  it("accepts client-generated thread ids in GUID form", () => {
    const threadId = crypto.randomUUID();

    expect(threadCreateSchema.parse({ threadId, title: "t" }).threadId).toBe(
      threadId,
    );
    // Not an RFC 9562 version/variant, which zod 3's uuid() also accepted.
    expect(
      threadCreateSchema.safeParse({
        threadId: "123e4567-e89b-02d3-0456-426614174000",
        title: "t",
      }).success,
    ).toBe(true);
    expect(
      threadCreateSchema.safeParse({
        threadId: "ckz8n3x0h0000qzrmn831i7rn",
        title: "t",
      }).success,
    ).toBe(false);
  });
});

describe("workspaceCreateSchema", () => {
  it("treats a blank root path as missing", () => {
    expect(
      workspaceCreateSchema.parse({ name: "Sentinel", rootPath: "   " }),
    ).toEqual({ description: "", name: "Sentinel" });
  });

  it("trims and keeps absolute root paths", () => {
    expect(
      workspaceCreateSchema.parse({
        description: "Desktop app",
        name: "Sentinel",
        rootPath: " /Users/dev/sentinel ",
      }),
    ).toEqual({
      description: "Desktop app",
      name: "Sentinel",
      rootPath: "/Users/dev/sentinel",
    });
  });

  it("rejects relative root paths", () => {
    const result = workspaceCreateSchema.safeParse({
      name: "Sentinel",
      rootPath: "projects/sentinel",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Enter an absolute path.",
    ]);
  });
});

describe("threadUIMessageSchema", () => {
  it("round-trips nested JSON parts and metadata", () => {
    const message = {
      id: "message-1",
      metadata: { model: { providerId: "openai" }, tags: ["a", 1, null] },
      parts: [
        { text: "hello", type: "text" },
        {
          input: { filter: { status: { $in: ["open"] } } },
          state: "input-available",
          toolCallId: "call-1",
          type: "tool-mongo_find",
        },
      ],
      role: "assistant",
    };

    expect(threadUIMessageSchema.parse(message)).toEqual(message);
  });
});

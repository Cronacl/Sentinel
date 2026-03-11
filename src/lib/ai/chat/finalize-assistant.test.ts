// @ts-nocheck

import { describe, expect, it } from "bun:test";

import { buildActiveThreadMessages } from "../thread-branches";
import type { ThreadUIMessage } from "../thread-message-types";

import { buildPersistedAssistantMessage } from "./finalize-assistant";

describe("buildPersistedAssistantMessage", () => {
  it("preserves assistant lineage when finalizing a regenerated response", () => {
    const placeholder: ThreadUIMessage = {
      id: "assistant-2",
      metadata: {
        branchId: "user-1",
        isActive: true,
        model: {
          providerId: "openai",
          requestedModelId: "openai:gpt-5.2",
        },
        parentMessageId: "user-1",
        status: "pending",
      },
      parts: [{ text: " ", type: "text" }],
      role: "assistant",
    };

    const finalAssistant: ThreadUIMessage = {
      id: "streamed-id",
      metadata: {
        finishReason: "stop",
        model: {
          responseModelId: "gpt-5.2",
        },
        usage: {
          outputTokens: 12,
          totalTokens: 24,
        },
      },
      parts: [{ text: "Second answer", type: "text" }],
      role: "assistant",
    };

    const persistedAssistant = buildPersistedAssistantMessage({
      assistantId: placeholder.id,
      finalAssistant,
      placeholder,
    });

    expect(persistedAssistant.id).toBe("assistant-2");
    expect(persistedAssistant.metadata?.parentMessageId).toBe("user-1");
    expect(persistedAssistant.metadata?.branchId).toBe("user-1");
    expect(persistedAssistant.metadata?.model?.requestedModelId).toBe(
      "openai:gpt-5.2",
    );
    expect(persistedAssistant.metadata?.model?.responseModelId).toBe("gpt-5.2");
    expect(persistedAssistant.metadata?.status).toBe("completed");

    const transcript = buildActiveThreadMessages([
      {
        createdAt: new Date("2026-03-10T10:00:00.000Z"),
        id: "db-user-1",
        messageId: "user-1",
        metadata: { isActive: true, status: "completed" },
        parts: [{ text: "hey", type: "text" }],
        role: "user",
        updatedAt: new Date("2026-03-10T10:00:00.000Z"),
      },
      {
        createdAt: new Date("2026-03-10T10:00:01.000Z"),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {
          branchId: "user-1",
          isActive: false,
          parentMessageId: "user-1",
          status: "completed",
        },
        parts: [{ text: "First answer", type: "text" }],
        role: "assistant",
        updatedAt: new Date("2026-03-10T10:00:01.000Z"),
      },
      {
        createdAt: new Date("2026-03-10T10:00:02.000Z"),
        id: "db-assistant-2",
        messageId: persistedAssistant.id,
        metadata: persistedAssistant.metadata,
        parts: persistedAssistant.parts,
        role: persistedAssistant.role,
        updatedAt: new Date("2026-03-10T10:00:02.000Z"),
      },
    ]);

    expect(transcript).toHaveLength(2);
    expect(transcript[1]?.id).toBe("assistant-2");
    expect(transcript[1]?.metadata?.branchOptions).toHaveLength(2);
  });

  it("marks finalized assistants as error without dropping lineage metadata", () => {
    const placeholder: ThreadUIMessage = {
      id: "assistant-3",
      metadata: {
        branchId: "user-1",
        isActive: true,
        parentMessageId: "user-1",
        status: "pending",
      },
      parts: [{ text: " ", type: "text" }],
      role: "assistant",
    };

    const finalAssistant = buildPersistedAssistantMessage({
      assistantId: placeholder.id,
      errorMessage: "Generation failed.",
      placeholder,
    });

    expect(finalAssistant.metadata?.parentMessageId).toBe("user-1");
    expect(finalAssistant.metadata?.branchId).toBe("user-1");
    expect(finalAssistant.metadata?.errorMessage).toBe("Generation failed.");
    expect(finalAssistant.metadata?.status).toBe("error");
  });

  it("keeps server-assigned lineage when streamed assistant metadata clears it", () => {
    const placeholder: ThreadUIMessage = {
      id: "assistant-4",
      metadata: {
        branchId: "user-2",
        isActive: true,
        parentMessageId: "user-2",
        status: "pending",
      },
      parts: [{ text: " ", type: "text" }],
      role: "assistant",
    };

    const finalAssistant: ThreadUIMessage = {
      id: "streamed-id",
      metadata: {
        branchId: undefined,
        finishReason: "stop",
        parentMessageId: null,
      },
      parts: [{ text: "Tool-backed answer", type: "text" }],
      role: "assistant",
    };

    const persistedAssistant = buildPersistedAssistantMessage({
      assistantId: placeholder.id,
      finalAssistant,
      placeholder,
    });

    expect(persistedAssistant.metadata?.parentMessageId).toBe("user-2");
    expect(persistedAssistant.metadata?.branchId).toBe("user-2");
  });

  it("reconstructs corrupted assistant lineage when older rows were saved with null parents", () => {
    const transcript = buildActiveThreadMessages([
      {
        createdAt: new Date("2026-03-10T10:00:00.000Z"),
        id: "db-user-1",
        messageId: "user-1",
        metadata: {
          branchId: "user-1",
          isActive: true,
          parentMessageId: null,
          status: "completed",
        },
        parts: [{ text: "check node", type: "text" }],
        role: "user",
        updatedAt: new Date("2026-03-10T10:00:00.000Z"),
      },
      {
        createdAt: new Date("2026-03-10T10:00:01.000Z"),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {
          isActive: false,
          parentMessageId: null,
          status: "completed",
        },
        parts: [{ text: "Node is installed.", type: "text" }],
        role: "assistant",
        updatedAt: new Date("2026-03-10T10:00:01.000Z"),
      },
      {
        createdAt: new Date("2026-03-10T10:00:02.000Z"),
        id: "db-user-2",
        messageId: "user-2",
        metadata: {
          branchId: "user-2",
          isActive: true,
          parentMessageId: "assistant-1",
          status: "completed",
        },
        parts: [{ text: "how about git", type: "text" }],
        role: "user",
        updatedAt: new Date("2026-03-10T10:00:02.000Z"),
      },
      {
        createdAt: new Date("2026-03-10T10:00:03.000Z"),
        id: "db-assistant-2",
        messageId: "assistant-2",
        metadata: {
          isActive: false,
          parentMessageId: null,
          status: "completed",
        },
        parts: [{ text: "Git is installed.", type: "text" }],
        role: "assistant",
        updatedAt: new Date("2026-03-10T10:00:03.000Z"),
      },
    ]);

    expect(transcript.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
    expect(transcript[1]?.metadata?.parentMessageId).toBe("user-1");
    expect(transcript[3]?.metadata?.parentMessageId).toBe("user-2");
  });
});

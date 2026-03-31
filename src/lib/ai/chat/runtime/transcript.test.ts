import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";

import {
  buildModelTranscript,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "./transcript";

function makeMessage(
  id: string,
  role: ThreadUIMessage["role"],
  text: string,
  metadata: ThreadUIMessage["metadata"] = {},
): ThreadUIMessage {
  return {
    id,
    metadata,
    parts: [{ text, type: "text" }],
    role,
  };
}

function makeRecord(
  message: ThreadUIMessage,
  createdAtMs: number,
): PersistedThreadMessageRecord {
  return {
    createdAt: new Date(createdAtMs),
    id: `db-${message.id}`,
    messageId: message.id,
    metadata: message.metadata,
    parts: message.parts,
    role: message.role,
    updatedAt: new Date(createdAtMs),
  };
}

describe("truncateTranscriptAtMessage", () => {
  it("truncates transcript history at the restored assistant turn", () => {
    const transcript = [
      makeMessage("user-1", "user", "first"),
      makeMessage("assistant-1", "assistant", "first reply"),
      makeMessage("user-2", "user", "second"),
      makeMessage("assistant-2", "assistant", "second reply"),
    ];

    expect(
      truncateTranscriptAtMessage(transcript, "assistant-1").map(
        (message) => message.id,
      ),
    ).toEqual(["user-1", "assistant-1"]);
  });

  it("builds the next model transcript from the restored turn onward", () => {
    const transcript = truncateTranscriptAtMessage(
      [
        makeMessage("user-1", "user", "first"),
        makeMessage("assistant-1", "assistant", "first reply"),
        makeMessage("user-2", "user", "second"),
        makeMessage("assistant-2", "assistant", "second reply"),
      ],
      "assistant-1",
    );
    const nextUser = makeMessage("user-3", "user", "branch from restore");

    const result = buildModelTranscript(
      {
        engine: "sentinel",
        message: nextUser,
        threadId: "thread-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as never,
      transcript,
      [],
    );

    expect(result.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-3",
    ]);
  });
});

describe("edit branching helpers", () => {
  it("keeps the original parent when editing a restored user turn", () => {
    const transcript = [
      makeMessage("user-1", "user", "first"),
      makeMessage("assistant-1", "assistant", "first reply", {
        parentMessageId: "user-1",
      }),
      makeMessage("user-2", "user", "second", {
        parentMessageId: "assistant-1",
      }),
      makeMessage("assistant-2", "assistant", "second reply", {
        parentMessageId: "user-2",
      }),
    ];
    const allRecords = transcript.map((message, index) =>
      makeRecord(message, index + 1),
    );
    const restoredTranscript = truncateTranscriptAtMessage(
      transcript,
      "user-2",
    );

    expect(
      getUserParentMessageId(
        {
          engine: "sentinel",
          message: makeMessage("user-2-edit", "user", "revised second"),
          messageId: "user-2",
          threadId: "thread-1",
          trigger: "edit-user-message",
          userId: "user-1",
          workspaceId: "workspace-1",
        } as never,
        restoredTranscript,
        allRecords,
      ),
    ).toBe("assistant-1");
  });

  it("builds an edited branch from the restored user turn", () => {
    const transcript = truncateTranscriptAtMessage(
      [
        makeMessage("user-1", "user", "first"),
        makeMessage("assistant-1", "assistant", "first reply", {
          parentMessageId: "user-1",
        }),
        makeMessage("user-2", "user", "second", {
          parentMessageId: "assistant-1",
        }),
        makeMessage("assistant-2", "assistant", "second reply", {
          parentMessageId: "user-2",
        }),
      ],
      "user-2",
    );
    const records = transcript.map((message, index) =>
      makeRecord(message, index + 1),
    );

    const result = buildModelTranscript(
      {
        engine: "sentinel",
        message: makeMessage("user-2-edit", "user", "revised second"),
        messageId: "user-2",
        threadId: "thread-1",
        trigger: "edit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as never,
      transcript,
      records,
    );

    expect(result.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2-edit",
    ]);
    expect(result.at(-1)?.metadata).toMatchObject({
      editedFromMessageId: "user-2",
      parentMessageId: "assistant-1",
    });
  });
});

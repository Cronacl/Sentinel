import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const loadThreadMessages = mock(async () => []);

function toDataUrl(value: Buffer, mediaType: string) {
  return `data:${mediaType};base64,${value.toString("base64")}`;
}

describe("load_document tool", () => {
  beforeEach(async () => {
    const { __internal } = await import("@/lib/documents/loader");
    __internal.setModuleImportersForTests({
      branches: async () => ({
        buildActiveThreadMessages: (records: Array<any>) =>
          records.map((record) => ({
            id: record.messageId,
            metadata: {},
            parts: record.parts,
            role: record.role,
          })),
      }),
      persistence: async () => ({
        loadThreadMessages,
      }),
    });
  });

  afterEach(async () => {
    loadThreadMessages.mockReset();
    const { __internal } = await import("@/lib/documents/loader");
    __internal.resetModuleImportersForTests();
  });

  it("loads attachments using the current source message by default", async () => {
    loadThreadMessages.mockImplementation(async () => [
      {
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        id: "db-1",
        messageId: "message-1",
        metadata: {},
        parts: [
          {
            filename: "sheet.csv",
            mediaType: "text/csv",
            type: "file",
            url: toDataUrl(Buffer.from("name\nalpha\n"), "text/csv"),
          },
        ],
        role: "user",
        updatedAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    const { executeLoadDocument } = await import("./load-document");
    const result = await executeLoadDocument({
      defaultDirectory: "/tmp/workspace",
      input: {
        filename: "sheet.csv",
        source: "message_attachment",
      },
      permissionMode: "default",
      sourceMessageId: "message-1",
      threadId: "thread-1",
    });

    expect(loadThreadMessages).toHaveBeenCalledWith("thread-1");
    expect(result.resolvedFromMessageId).toBe("message-1");
    expect(result.content).toContain("# Sheet: Sheet1");
  });

  it("emits bounded markdown text for model output", async () => {
    const { toLoadDocumentModelOutput } = await import("./load-document");

    expect(
      toLoadDocumentModelOutput({
        content: "# Summary",
        filename: "report.docx",
        format: "docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        requestedSource: "workspace_path",
        sourceKind: "workspace_path",
        truncated: false,
        warnings: [],
      }),
    ).toEqual({
      type: "text",
      value:
        "Document: report.docx\nSource: workspace_path\nFormat: docx\nMedia type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\n\n# Summary",
    });
  });
});

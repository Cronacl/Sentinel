import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import xlsx from "node-xlsx";

const tempRoots: string[] = [];
const loadThreadMessages = mock(async () => []);

function toDataUrl(value: Buffer, mediaType: string) {
  return `data:${mediaType};base64,${value.toString("base64")}`;
}

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-doc-loader-"));
  tempRoots.push(root);
  return root;
}

beforeEach(async () => {
  const { __internal } = await import("./loader");
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
  const { __internal } = await import("./loader");
  __internal.resetModuleImportersForTests();
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("document loader", () => {
  it("installs pdfjs-compatible DOM polyfills for node document parsing", async () => {
    const { __internal } = await import("./loader");
    const globalScope = globalThis as typeof globalThis & {
      DOMMatrix?: unknown;
      ImageData?: unknown;
      Path2D?: unknown;
    };
    const originalDOMMatrix = globalScope.DOMMatrix;
    const originalImageData = globalScope.ImageData;
    const originalPath2D = globalScope.Path2D;

    Reflect.deleteProperty(globalScope, "DOMMatrix");
    Reflect.deleteProperty(globalScope, "ImageData");
    Reflect.deleteProperty(globalScope, "Path2D");

    try {
      __internal.ensurePdfJsNodePolyfills();

      expect(typeof globalScope.DOMMatrix).toBe("function");
      expect(typeof globalScope.ImageData).toBe("function");
      expect(typeof globalScope.Path2D).toBe("function");

      const Matrix = globalScope.DOMMatrix as new (
        init?: ArrayLike<number>,
      ) => {
        a: number;
        d: number;
        e: number;
        f: number;
        invertSelf(): {
          a: number;
          d: number;
          e: number;
          f: number;
        };
        scale(
          scaleX?: number,
          scaleY?: number,
        ): {
          e: number;
          f: number;
        };
        translate(
          tx?: number,
          ty?: number,
        ): {
          e: number;
          f: number;
        };
      };
      const translated = new Matrix([1, 0, 0, 1, 10, 20]).translate(5, 6);
      const scaled = new Matrix([1, 0, 0, 1, 3, 4]).scale(2, 3);
      const inverted = new Matrix([2, 0, 0, 4, 10, 20]).invertSelf();

      expect(translated.e).toBe(15);
      expect(translated.f).toBe(26);
      expect(scaled.e).toBe(3);
      expect(scaled.f).toBe(4);
      expect(inverted.a).toBe(0.5);
      expect(inverted.d).toBe(0.25);
      expect(inverted.e).toBe(-5);
      expect(inverted.f).toBe(-5);
    } finally {
      if (originalDOMMatrix === undefined) {
        Reflect.deleteProperty(globalScope, "DOMMatrix");
      } else {
        globalScope.DOMMatrix = originalDOMMatrix;
      }

      if (originalImageData === undefined) {
        Reflect.deleteProperty(globalScope, "ImageData");
      } else {
        globalScope.ImageData = originalImageData;
      }

      if (originalPath2D === undefined) {
        Reflect.deleteProperty(globalScope, "Path2D");
      } else {
        globalScope.Path2D = originalPath2D;
      }
    }
  });

  it("loads workspace files while respecting default-mode boundaries", async () => {
    const { loadDocument } = await import("./loader");
    const workspace = await createWorkspace();
    await writeFile(
      path.join(workspace, "report.csv"),
      "name,value\nalpha,1\n",
    );

    const result = await loadDocument(
      {
        path: "report.csv",
        source: "workspace_path",
      },
      {
        defaultDirectory: workspace,
        permissionMode: "default",
      },
    );

    expect(result.filename).toBe("report.csv");
    expect(result.sheetNames).toEqual(["Sheet1"]);
    expect(result.content).toContain("# Sheet: Sheet1");
    expect(result.content).toContain("| name | value |");

    await expect(
      loadDocument(
        {
          path: path.join(os.tmpdir(), "outside.csv"),
          source: "workspace_path",
        },
        {
          defaultDirectory: workspace,
          permissionMode: "default",
        },
      ),
    ).rejects.toThrow(/relative paths/i);
  });

  it("defaults attachment lookup to sourceMessageId", async () => {
    const { loadDocument } = await import("./loader");
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
            url: toDataUrl(Buffer.from("name,value\nbeta,2\n"), "text/csv"),
          },
        ],
        role: "user",
        updatedAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    const result = await loadDocument(
      {
        filename: "sheet.csv",
        source: "message_attachment",
      },
      {
        defaultDirectory: "/tmp",
        permissionMode: "default",
        sourceMessageId: "message-1",
        threadId: "thread-1",
      },
    );

    expect(loadThreadMessages).toHaveBeenCalledWith("thread-1");
    expect(result.sourceKind).toBe("message_attachment");
    expect(result.content).toContain("| name | value |");
  });

  it("requires attachmentIndex when duplicate attachment filenames exist", async () => {
    const { loadDocument } = await import("./loader");
    loadThreadMessages.mockImplementation(async () => [
      {
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        id: "db-1",
        messageId: "message-1",
        metadata: {},
        parts: [
          {
            filename: "duplicate.csv",
            mediaType: "text/csv",
            type: "file",
            url: toDataUrl(Buffer.from("name\nfirst\n"), "text/csv"),
          },
          {
            filename: "duplicate.csv",
            mediaType: "text/csv",
            type: "file",
            url: toDataUrl(Buffer.from("name\nsecond\n"), "text/csv"),
          },
        ],
        role: "user",
        updatedAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    await expect(
      loadDocument(
        {
          filename: "duplicate.csv",
          source: "message_attachment",
        },
        {
          defaultDirectory: "/tmp",
          permissionMode: "default",
          sourceMessageId: "message-1",
          threadId: "thread-1",
        },
      ),
    ).rejects.toThrow(/attachmentIndex/i);

    const result = await loadDocument(
      {
        attachmentIndex: 2,
        filename: "duplicate.csv",
        source: "message_attachment",
      },
      {
        defaultDirectory: "/tmp",
        permissionMode: "default",
        sourceMessageId: "message-1",
        threadId: "thread-1",
      },
    );

    expect(result.content).toContain("second");
  });

  it("parses generated xlsx workbooks into markdown tables", async () => {
    const { loadInlineAttachmentDocument } = await import("./loader");
    const workbook = xlsx.build([
      {
        data: [
          ["name", "value"],
          ["gamma", 3],
        ],
        name: "Summary",
        options: {},
      },
    ]);

    const result = await loadInlineAttachmentDocument({
      filename: "report.xlsx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      url: toDataUrl(
        Buffer.from(workbook),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    });

    expect(result.sheetNames).toEqual(["Summary"]);
    expect(result.content).toContain("# Sheet: Summary");
    expect(result.content).toContain("| name | value |");
  });

  it("extracts pdf text through officeparser", async () => {
    const { loadInlineAttachmentDocument } = await import("./loader");

    const result = await loadInlineAttachmentDocument({
      filename: "hello.pdf",
      mediaType: "application/pdf",
      url: toDataUrl(
        Buffer.from(SAMPLE_PDF_BASE64, "base64"),
        "application/pdf",
      ),
    });

    expect(result.content).toContain("Hello PDF World");
    expect(result.content).toContain("Second line of text");
  }, 20_000);

  it("extracts odt headings, lists and tables through officeparser", async () => {
    const { loadInlineAttachmentDocument } = await import("./loader");

    const result = await loadInlineAttachmentDocument({
      filename: "report.odt",
      mediaType: "application/vnd.oasis.opendocument.text",
      url: toDataUrl(
        Buffer.from(SAMPLE_ODT_BASE64, "base64"),
        "application/vnd.oasis.opendocument.text",
      ),
    });

    expect(result.content).toContain("Quarterly Report");
    expect(result.content).toContain("Revenue grew 12% this quarter.");
    expect(result.content).toContain("First item");
    expect(result.content).toContain("B2");
  }, 20_000);

  it("fails fast on malformed office documents", async () => {
    const { loadInlineAttachmentDocument } = await import("./loader");

    await expect(
      loadInlineAttachmentDocument({
        filename: "broken.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: toDataUrl(
          Buffer.from("this is not a real docx"),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      }),
    ).rejects.toThrow();
  });
});

// Tiny fixtures generated for the officeparser path: a one-page PDF with two
// text lines, and an ODT (macOS textutil) with a heading, list and table.
const SAMPLE_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4MCA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDcyIDcyMCBUZCAoSGVsbG8gUERGIFdvcmxkKSBUaiAwIC0zMCBUZCAoU2Vjb25kIGxpbmUgb2YgdGV4dCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNzEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0NDEKJSVFT0YK";
const SAMPLE_ODT_BASE64 =
  "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";

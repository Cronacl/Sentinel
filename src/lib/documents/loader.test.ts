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

import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import TurndownService from "turndown";

import { resolveToolPath } from "@/lib/ai/chat/tools/paths";
import {
  detectAttachmentType,
  getAttachmentExtension,
  inferAttachmentMimeType,
  normalizeAttachmentMimeType,
} from "@/lib/files/chat-attachment-types";
import type { PermissionMode } from "@/lib/security";

export type DocumentSourceKind = "workspace_path" | "message_attachment";

export type DocumentLoadInput =
  | {
      path: string;
      source: "workspace_path";
    }
  | {
      attachmentIndex?: number;
      filename: string;
      messageId?: string;
      source: "message_attachment";
    };

export type DocumentLoadResult = {
  content: string;
  filename: string;
  format: string;
  mediaType: string;
  sheetNames?: string[];
  slideCount?: number;
  sourceKind: DocumentSourceKind;
  truncated: boolean;
  warnings: string[];
};

export type DocumentLoadRuntime = {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  permissionMode: PermissionMode;
  sourceMessageId?: string | null;
  threadId?: string;
};

type PersistenceModule = Pick<
  typeof import("@/lib/ai/chat/persistence"),
  "loadThreadMessages"
>;

type BranchesModule = Pick<
  typeof import("@/lib/ai/messages/branches"),
  "buildActiveThreadMessages"
>;

type ResolvedDocumentSource = {
  data: Buffer;
  filename: string;
  format: string;
  mediaType: string;
  sourceKind: DocumentSourceKind;
};

type ExtractedDocument = {
  content: string;
  sheetNames?: string[];
  slideCount?: number;
  truncated?: boolean;
  warnings?: string[];
};

type OfficeAstNode = {
  children?: OfficeAstNode[];
  metadata?: Record<string, unknown>;
  text?: string;
  type?: string;
};

type MatrixTuple = [number, number, number, number, number, number];
type MatrixInitLike =
  | ArrayLike<number>
  | {
      a?: number;
      b?: number;
      c?: number;
      d?: number;
      e?: number;
      f?: number;
      m11?: number;
      m12?: number;
      m21?: number;
      m22?: number;
      m41?: number;
      m42?: number;
    };

const DEFAULT_MAX_CHARS = 20_000;
const MAX_ALLOWED_CHARS = 120_000;
const MAX_SHEET_COUNT = 10;
const MAX_SHEET_ROWS = 200;
const MAX_SHEET_COLUMNS = 20;
const MAX_CELL_CHARS = 200;
const MAX_SLIDE_COUNT = 100;
const CACHE_NAMESPACE = "document-loader:v1";
const documentCache = new Map<string, Promise<DocumentLoadResult>>();
const runtimeImport = new Function("specifier", "return import(specifier)") as <
  T = unknown,
>(
  specifier: string,
) => Promise<T>;
const MAMMOTH_SPECIFIER = ["mam", "moth"].join("");
const NODE_XLSX_SPECIFIER = ["node", "-xlsx"].join("");
const NODE_PPTX_PARSER_SPECIFIER = ["node", "-pptx-", "parser"].join("");
const OFFICEPARSER_SPECIFIER = ["office", "parser"].join("");
const PPT_SPECIFIER = ["p", "p", "t"].join("");
const RTF2TEXT_SPECIFIER = ["rtf", "2text"].join("");
const WORD_EXTRACTOR_SPECIFIER = ["word", "-extractor"].join("");
let importPersistenceModule = async (): Promise<PersistenceModule> =>
  await import("@/lib/ai/chat/persistence");
let importBranchesModule = async (): Promise<BranchesModule> =>
  await import("@/lib/ai/messages/branches");

function toFiniteNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toMatrixTuple(init?: string | MatrixInitLike | null): MatrixTuple {
  if (!init || typeof init === "string") {
    return [1, 0, 0, 1, 0, 0];
  }

  const values = Array.from(init as ArrayLike<number>);
  if (values.length >= 6) {
    return [
      toFiniteNumber(values[0], 1),
      toFiniteNumber(values[1], 0),
      toFiniteNumber(values[2], 0),
      toFiniteNumber(values[3], 1),
      toFiniteNumber(values[4], 0),
      toFiniteNumber(values[5], 0),
    ];
  }

  const matrix = init as Exclude<MatrixInitLike, ArrayLike<number>>;
  return [
    toFiniteNumber(matrix.a ?? matrix.m11, 1),
    toFiniteNumber(matrix.b ?? matrix.m12, 0),
    toFiniteNumber(matrix.c ?? matrix.m21, 0),
    toFiniteNumber(matrix.d ?? matrix.m22, 1),
    toFiniteNumber(matrix.e ?? matrix.m41, 0),
    toFiniteNumber(matrix.f ?? matrix.m42, 0),
  ];
}

function multiplyAffine(left: MatrixTuple, right: MatrixTuple): MatrixTuple {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

class MinimalDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;

  constructor(init?: string | MatrixInitLike) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = toMatrixTuple(
      init ?? null,
    );
  }

  get m11() {
    return this.a;
  }

  set m11(value: number) {
    this.a = value;
  }

  get m12() {
    return this.b;
  }

  set m12(value: number) {
    this.b = value;
  }

  get m21() {
    return this.c;
  }

  set m21(value: number) {
    this.c = value;
  }

  get m22() {
    return this.d;
  }

  set m22(value: number) {
    this.d = value;
  }

  get m41() {
    return this.e;
  }

  set m41(value: number) {
    this.e = value;
  }

  get m42() {
    return this.f;
  }

  set m42(value: number) {
    this.f = value;
  }

  get m13() {
    return 0;
  }

  get m14() {
    return 0;
  }

  get m23() {
    return 0;
  }

  get m24() {
    return 0;
  }

  get m31() {
    return 0;
  }

  get m32() {
    return 0;
  }

  get m33() {
    return 1;
  }

  get m34() {
    return 0;
  }

  get m43() {
    return 0;
  }

  get m44() {
    return 1;
  }

  get isIdentity() {
    return (
      this.a === 1 &&
      this.b === 0 &&
      this.c === 0 &&
      this.d === 1 &&
      this.e === 0 &&
      this.f === 0
    );
  }

  multiplySelf(other?: string | MatrixInitLike) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = multiplyAffine(
      [this.a, this.b, this.c, this.d, this.e, this.f],
      toMatrixTuple(other ?? null),
    );

    return this;
  }

  preMultiplySelf(other?: string | MatrixInitLike) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = multiplyAffine(
      toMatrixTuple(other ?? null),
      [this.a, this.b, this.c, this.d, this.e, this.f],
    );

    return this;
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;

    if (!Number.isFinite(determinant) || determinant === 0) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this;
    }

    const inverse: MatrixTuple = [
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    ];

    [this.a, this.b, this.c, this.d, this.e, this.f] = inverse;
    return this;
  }

  translate(tx = 0, ty = 0) {
    return new MinimalDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).multiplySelf([1, 0, 0, 1, tx, ty]);
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new MinimalDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).multiplySelf([scaleX, 0, 0, scaleY, 0, 0]);
  }

  rotate(angle = 0) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);

    return new MinimalDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).multiplySelf([cosine, sine, -sine, cosine, 0, 0]);
  }

  transformPoint(point?: { w?: number; x?: number; y?: number; z?: number }) {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;

    return {
      w: point?.w ?? 1,
      x: x * this.a + y * this.c + this.e,
      y: x * this.b + y * this.d + this.f,
      z: point?.z ?? 0,
    };
  }

  toFloat64Array() {
    return Float64Array.from([
      this.a,
      this.b,
      0,
      0,
      this.c,
      this.d,
      0,
      0,
      0,
      0,
      1,
      0,
      this.e,
      this.f,
      0,
      1,
    ]);
  }

  static fromMatrix(other?: string | MatrixInitLike) {
    return new MinimalDOMMatrix(other);
  }
}

class MinimalImageData {
  colorSpace = "srgb";
  data: Uint8ClampedArray;
  height: number;
  width: number;

  constructor(
    widthOrData: number | Uint8ClampedArray,
    width?: number,
    height?: number,
  ) {
    if (typeof widthOrData === "number") {
      this.width = widthOrData;
      this.height = width ?? 0;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = widthOrData;
    this.width = width ?? 0;
    this.height =
      height ?? Math.floor(this.data.length / Math.max(this.width, 1) / 4);
  }
}

class MinimalPath2D {
  addPath() {}

  arc() {}

  arcTo() {}

  bezierCurveTo() {}

  closePath() {}

  ellipse() {}

  lineTo() {}

  moveTo() {}

  quadraticCurveTo() {}

  rect() {}

  roundRect() {}
}

function ensurePdfJsNodePolyfills() {
  if (typeof window !== "undefined") {
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };

  if (!globalScope.DOMMatrix) {
    globalScope.DOMMatrix = MinimalDOMMatrix as unknown as typeof DOMMatrix;
  }

  if (!globalScope.ImageData) {
    globalScope.ImageData = MinimalImageData as unknown as typeof ImageData;
  }

  if (!globalScope.Path2D) {
    globalScope.Path2D = MinimalPath2D;
  }
}

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  hr: "---",
});

turndown.remove(["link", "meta", "noscript", "script", "style"]);

function decodeBase64(value: string) {
  return Buffer.from(value, "base64");
}

function decodeDataUrl(url: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(url);

  if (!match) {
    throw new Error("Invalid attachment data URL.");
  }

  const [, mediaType, base64] = match;
  if (!base64) {
    throw new Error("Invalid attachment data URL.");
  }

  return {
    data: decodeBase64(base64),
    mediaType: mediaType || undefined,
  };
}

function getModuleDefault<T>(
  module: T,
): T extends { default: infer D } ? D : T {
  const candidate =
    module && typeof module === "object"
      ? ((module as Record<string, unknown>).default ?? module)
      : module;

  return candidate as T extends { default: infer D } ? D : T;
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function collapseBlankLines(value: string) {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function escapeMarkdownCell(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "<br/>")
    .replace(/\|/g, "\\|");
}

function stringifyCell(value: unknown) {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function trimCell(value: string) {
  if (value.length <= MAX_CELL_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_CELL_CHARS).trimEnd()}...`;
}

function truncateContent(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return {
      content: value,
      truncated: false,
    };
  }

  return {
    content: `${value.slice(0, maxChars).trimEnd()}\n\n[Content truncated to fit chat limits.]`,
    truncated: true,
  };
}

function renderPlainTextAsMarkdown(text: string, filename: string) {
  const normalized = normalizeText(text);
  const detected = detectAttachmentType(filename);

  if (!normalized) {
    return "";
  }

  if (detected.displayType === "md") {
    return normalized;
  }

  if (detected.displayType === "code") {
    const language = detected.language ?? "";
    return `\`\`\`${language}\n${normalized}\n\`\`\``;
  }

  return normalized;
}

function renderSheetTable(rows: unknown[][], sheetName: string) {
  if (rows.length === 0) {
    return {
      content: `# Sheet: ${sheetName}\n\n(Empty sheet)`,
      truncated: false,
      warnings: [] as string[],
    };
  }

  const warnings: string[] = [];
  const limitedRows = rows.slice(0, MAX_SHEET_ROWS);
  if (rows.length > limitedRows.length) {
    warnings.push(
      `Sheet "${sheetName}" was truncated to the first ${MAX_SHEET_ROWS} rows.`,
    );
  }

  const width = Math.min(
    MAX_SHEET_COLUMNS,
    limitedRows.reduce((max, row) => Math.max(max, row.length), 0),
  );

  const visibleRows = limitedRows.map((row) =>
    Array.from({ length: width }, (_, index) =>
      escapeMarkdownCell(trimCell(stringifyCell(row[index]))),
    ),
  );

  if (
    limitedRows.some((row) => row.length > width) ||
    rows.some((row) => row.length > MAX_SHEET_COLUMNS)
  ) {
    warnings.push(
      `Sheet "${sheetName}" was truncated to the first ${MAX_SHEET_COLUMNS} columns.`,
    );
  }

  const useFirstRowAsHeader = visibleRows.length > 1;
  const header = useFirstRowAsHeader
    ? visibleRows[0]!
    : Array.from({ length: width || 1 }, (_, index) => `Column ${index + 1}`);
  const body = useFirstRowAsHeader ? visibleRows.slice(1) : visibleRows;

  const tableLines = [
    `# Sheet: ${sheetName}`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];

  return {
    content: tableLines.join("\n"),
    truncated: warnings.length > 0,
    warnings,
  };
}

function renderSpreadsheet(sheets: Array<{ data: unknown[][]; name: string }>) {
  const warnings: string[] = [];
  const limitedSheets = sheets.slice(0, MAX_SHEET_COUNT);

  if (sheets.length > limitedSheets.length) {
    warnings.push(
      `Workbook was truncated to the first ${MAX_SHEET_COUNT} sheets.`,
    );
  }

  const renderedSheets = limitedSheets.map((sheet) =>
    renderSheetTable(sheet.data, sheet.name),
  );

  return {
    content: renderedSheets.map((sheet) => sheet.content).join("\n\n"),
    sheetNames: limitedSheets.map((sheet) => sheet.name),
    truncated:
      warnings.length > 0 || renderedSheets.some((sheet) => sheet.truncated),
    warnings: [
      ...warnings,
      ...renderedSheets.flatMap((sheet) => sheet.warnings),
    ],
  };
}

function renderPptxSlides(
  slides: Array<{
    id?: string;
    text?: string[];
  }>,
) {
  const limitedSlides = slides.slice(0, MAX_SLIDE_COUNT);
  const warnings: string[] = [];

  if (slides.length > limitedSlides.length) {
    warnings.push(
      `Presentation was truncated to the first ${MAX_SLIDE_COUNT} slides.`,
    );
  }

  const content = limitedSlides
    .map((slide, index) => {
      const lines = (slide.text ?? [])
        .map((line) => normalizeText(line))
        .filter(Boolean);

      if (lines.length === 0) {
        return `# Slide ${index + 1}\n\n(No extracted text)`;
      }

      const [title, ...rest] = lines;
      const bodyLines = rest.length > 0 ? rest.map((line) => `- ${line}`) : [];

      return [
        `# Slide ${index + 1}`,
        "",
        title ? `## ${title}` : null,
        ...(bodyLines.length > 0 ? ["", ...bodyLines] : []),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return {
    content,
    slideCount: slides.length,
    truncated: warnings.length > 0,
    warnings,
  };
}

function collectNodeText(node: OfficeAstNode | undefined): string {
  if (!node) {
    return "";
  }

  if (node.type === "text") {
    return normalizeText(node.text ?? "");
  }

  const childText = (node.children ?? [])
    .map((child) => collectNodeText(child))
    .filter(Boolean);
  if (childText.length > 0) {
    return childText.join(" ").trim();
  }

  return normalizeText(node.text ?? "");
}

function renderOfficeNodes(nodes: OfficeAstNode[], depth = 0): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "heading": {
        const level = Math.min(
          6,
          Math.max(
            1,
            Number(
              (node.metadata as { level?: number } | undefined)?.level ?? 1,
            ),
          ),
        );
        const text = collectNodeText(node);
        if (text) {
          lines.push(`${"#".repeat(level)} ${text}`, "");
        }
        break;
      }

      case "paragraph": {
        const text = collectNodeText(node);
        if (text) {
          lines.push(text, "");
        }
        break;
      }

      case "list": {
        const metadata = node.metadata as
          | { indentation?: number; itemIndex?: number; listType?: string }
          | undefined;
        const indentation = Math.max(0, metadata?.indentation ?? 0);
        const marker =
          metadata?.listType === "ordered"
            ? `${(metadata?.itemIndex ?? 0) + 1}.`
            : "-";
        const text = collectNodeText(node);
        if (text) {
          lines.push(`${"  ".repeat(indentation)}${marker} ${text}`);
        }
        break;
      }

      case "table": {
        const rows = (node.children ?? []).filter(
          (child) => child.type === "row",
        );
        const matrix = rows.map((row) =>
          (row.children ?? [])
            .filter((cell) => cell.type === "cell")
            .map((cell) => escapeMarkdownCell(trimCell(collectNodeText(cell)))),
        );

        if (matrix.length > 0) {
          const width = matrix.reduce(
            (max, row) => Math.max(max, row.length),
            0,
          );
          const normalized = matrix.map((row) =>
            Array.from({ length: width }, (_, index) => row[index] ?? ""),
          );
          const header =
            normalized[0] ??
            Array.from({ length: Math.max(width, 1) }, () => "");
          const body = normalized.slice(1);
          lines.push(`| ${header.join(" | ")} |`);
          lines.push(`| ${header.map(() => "---").join(" | ")} |`);
          for (const row of body) {
            lines.push(`| ${row.join(" | ")} |`);
          }
          lines.push("");
        }
        break;
      }

      case "slide": {
        const slideNumber =
          (node.metadata as { slideNumber?: number } | undefined)
            ?.slideNumber ?? depth + 1;
        lines.push(`# Slide ${slideNumber}`, "");
        if (node.children?.length) {
          lines.push(...renderOfficeNodes(node.children, depth + 1), "");
        } else {
          const text = collectNodeText(node);
          if (text) {
            lines.push(text, "");
          }
        }
        break;
      }

      case "sheet": {
        const sheetName =
          (node.metadata as { sheetName?: string } | undefined)?.sheetName ??
          `Sheet ${depth + 1}`;
        lines.push(`# Sheet: ${sheetName}`, "");
        if (node.children?.length) {
          lines.push(...renderOfficeNodes(node.children, depth + 1), "");
        }
        break;
      }

      case "note": {
        const text = collectNodeText(node);
        if (text) {
          lines.push("## Notes", "", text, "");
        }
        break;
      }

      case "page": {
        const pageNumber = (
          node.metadata as { pageNumber?: number } | undefined
        )?.pageNumber;
        lines.push(
          pageNumber ? `# Page ${pageNumber}` : "# Page",
          "",
          ...renderOfficeNodes(node.children ?? [], depth + 1),
          "",
        );
        break;
      }

      case "row":
      case "cell":
        break;

      default: {
        if (node.children?.length) {
          lines.push(...renderOfficeNodes(node.children, depth + 1));
          break;
        }

        const text = collectNodeText(node);
        if (text) {
          lines.push(text, "");
        }
      }
    }
  }

  return lines;
}

async function withTempFile<T>(
  source: ResolvedDocumentSource,
  fn: (filePath: string) => Promise<T>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "sentinel-doc-loader-"));
  const filePath = path.join(dir, source.filename);

  try {
    await writeFile(filePath, source.data);
    return await fn(filePath);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function extractDocx(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const mammoth = getModuleDefault(await runtimeImport(MAMMOTH_SPECIFIER)) as {
    convertToHtml(input: { buffer: Buffer }): Promise<{
      messages: Array<{ message: string }>;
      value: string;
    }>;
  };
  const result = await mammoth.convertToHtml({ buffer: source.data });
  const content = collapseBlankLines(turndown.turndown(result.value).trim());

  return {
    content,
    warnings: result.messages.map((message) => message.message),
  };
}

async function extractLegacyDoc(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const WordExtractor = getModuleDefault(
    await runtimeImport(WORD_EXTRACTOR_SPECIFIER),
  ) as new () => {
    extract(buffer: Buffer): Promise<{
      getBody(): string;
      getEndnotes(): string;
      getFootnotes(): string;
      getTextboxes(): string;
    }>;
  };
  const extractor = new WordExtractor();
  const document = await extractor.extract(source.data);
  const content = collapseBlankLines(
    [
      document.getBody(),
      document.getFootnotes(),
      document.getEndnotes(),
      document.getTextboxes(),
    ]
      .map((segment) => normalizeText(segment))
      .filter(Boolean)
      .join("\n\n"),
  );

  return { content };
}

async function extractRtf(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const rtf2text = getModuleDefault(
    await runtimeImport(RTF2TEXT_SPECIFIER),
  ) as {
    string(
      input: string,
      callback: (error: unknown, text?: string | null) => void,
    ): void;
  };
  const content = await new Promise<string>((resolve, reject) => {
    rtf2text.string(source.data.toString("utf8"), (error, text) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(text ?? "");
    });
  });

  return {
    content: collapseBlankLines(normalizeText(content)),
  };
}

async function extractSpreadsheet(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const xlsx = getModuleDefault(await runtimeImport(NODE_XLSX_SPECIFIER)) as {
    parse(input: Buffer): Array<{ data?: unknown[][] | null; name: string }>;
  };
  const sheets = xlsx.parse(source.data).map((sheet) => ({
    data: (sheet.data ?? []) as unknown[][],
    name: sheet.name,
  }));

  return renderSpreadsheet(sheets);
}

async function extractPptx(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const PptxParser = getModuleDefault(
    await runtimeImport(NODE_PPTX_PARSER_SPECIFIER),
  ) as new (filePath: string) => {
    extractText(): Promise<Array<{ id?: string; text?: string[] }>>;
  };
  return await withTempFile(source, async (filePath) => {
    const parser = new PptxParser(filePath);
    const slides = await parser.extractText();
    return renderPptxSlides(slides);
  });
}

async function extractPpt(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  const PPT = getModuleDefault(await runtimeImport(PPT_SPECIFIER)) as {
    readFile(filePath: string): { slides?: unknown[] };
    utils: {
      to_text(input: unknown): string[];
    };
  };
  return await withTempFile(source, async (filePath) => {
    const parsed = PPT.readFile(filePath);
    const textBlocks = PPT.utils.to_text(parsed) as string[];
    const slideCount = Array.isArray((parsed as { slides?: unknown[] }).slides)
      ? ((parsed as { slides?: unknown[] }).slides?.length ?? 0)
      : undefined;

    const content = (textBlocks ?? [])
      .map((block, index) =>
        [`# Slide ${index + 1}`, "", normalizeText(block)].join("\n"),
      )
      .join("\n\n");

    return {
      content: collapseBlankLines(content),
      ...(slideCount ? { slideCount } : {}),
    };
  });
}

async function extractOfficeParserDocument(
  source: ResolvedDocumentSource,
): Promise<ExtractedDocument> {
  ensurePdfJsNodePolyfills();
  const { parseOffice } = (await runtimeImport(OFFICEPARSER_SPECIFIER)) as {
    parseOffice(
      input: Buffer,
      options: {
        extractAttachments: boolean;
        includeRawContent: boolean;
        outputErrorToConsole: boolean;
      },
    ): Promise<{
      content?: OfficeAstNode[] | null;
      toText(): string;
      type?: string;
    }>;
  };
  const ast = await parseOffice(source.data, {
    extractAttachments: false,
    includeRawContent: false,
    outputErrorToConsole: false,
  });

  const lines = renderOfficeNodes((ast.content ?? []) as OfficeAstNode[]);
  const rendered = collapseBlankLines(lines.join("\n"));
  const fallbackText = collapseBlankLines(normalizeText(ast.toText()));

  return {
    content: rendered || fallbackText,
    ...(ast.type === "odp" && Array.isArray(ast.content)
      ? {
          slideCount: ast.content.filter((node) => node.type === "slide")
            .length,
        }
      : {}),
    ...(ast.type === "ods" && Array.isArray(ast.content)
      ? {
          sheetNames: ast.content
            .filter((node) => node.type === "sheet")
            .map(
              (node) =>
                (node.metadata as { sheetName?: string } | undefined)
                  ?.sheetName ?? "Sheet",
            ),
        }
      : {}),
  };
}

async function extractDocument(source: ResolvedDocumentSource) {
  switch (source.format) {
    case "txt":
    case "md":
    case "json":
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "rb":
    case "go":
    case "rs":
    case "java":
    case "c":
    case "cpp":
    case "css":
    case "html":
    case "xml":
    case "yaml":
    case "yml":
    case "toml":
    case "sql":
    case "sh":
      return {
        content: renderPlainTextAsMarkdown(
          source.data.toString("utf8"),
          source.filename,
        ),
      } satisfies ExtractedDocument;
    case "csv":
    case "xlsx":
    case "xls":
    case "ods":
      return await extractSpreadsheet(source);
    case "docx":
      return await extractDocx(source);
    case "doc":
      return await extractLegacyDoc(source);
    case "rtf":
      return await extractRtf(source);
    case "pptx":
      return await extractPptx(source);
    case "ppt":
      return await extractPpt(source);
    case "odt":
    case "odp":
    case "pdf":
      return await extractOfficeParserDocument(source);
    default:
      throw new Error(
        `Unsupported document format "${source.format}" for ${source.filename}.`,
      );
  }
}

async function resolveMessageAttachmentSource(
  runtime: DocumentLoadRuntime,
  input: Extract<DocumentLoadInput, { source: "message_attachment" }>,
): Promise<ResolvedDocumentSource> {
  if (!runtime.threadId) {
    throw new Error("Thread id is required to load a message attachment.");
  }

  const [{ loadThreadMessages }, { buildActiveThreadMessages }] =
    await Promise.all([importPersistenceModule(), importBranchesModule()]);
  const allRecords = await loadThreadMessages(runtime.threadId);
  const transcript = buildActiveThreadMessages(allRecords);
  const targetMessageId = input.messageId ?? runtime.sourceMessageId;

  if (!targetMessageId) {
    throw new Error(
      "No source message is available. Provide messageId to load an attachment from another message.",
    );
  }

  const message = transcript.find(
    (candidate) => candidate.id === targetMessageId,
  );
  if (!message) {
    throw new Error(
      `Message "${targetMessageId}" was not found in this thread.`,
    );
  }

  const matchingParts = message.parts.filter(
    (part): part is Extract<(typeof message.parts)[number], { type: "file" }> =>
      part.type === "file" &&
      (part.filename ?? "Attachment") === input.filename,
  );

  if (matchingParts.length === 0) {
    throw new Error(
      `Attachment "${input.filename}" was not found on message "${targetMessageId}".`,
    );
  }

  const selectedIndex = input.attachmentIndex ? input.attachmentIndex - 1 : 0;
  if (matchingParts.length > 1 && input.attachmentIndex == null) {
    throw new Error(
      `Attachment "${input.filename}" appears multiple times on message "${targetMessageId}". Provide attachmentIndex to disambiguate.`,
    );
  }

  const selected = matchingParts[selectedIndex];
  if (!selected) {
    throw new Error(
      `attachmentIndex ${input.attachmentIndex} is out of range for "${input.filename}".`,
    );
  }

  if (
    selected.url.startsWith("http://") ||
    selected.url.startsWith("https://")
  ) {
    throw new Error(
      `Remote attachment URLs are not supported for "${input.filename}".`,
    );
  }

  if (selected.url.startsWith("data:")) {
    const parsed = decodeDataUrl(selected.url);
    return {
      data: parsed.data,
      filename: selected.filename ?? input.filename,
      format:
        getAttachmentExtension(selected.filename ?? input.filename) ?? "txt",
      mediaType:
        normalizeAttachmentMimeType(parsed.mediaType) ??
        normalizeAttachmentMimeType(selected.mediaType) ??
        inferAttachmentMimeType(selected.filename ?? input.filename),
      sourceKind: "message_attachment",
    };
  }

  if (path.isAbsolute(selected.url)) {
    return {
      data: await readFile(selected.url),
      filename: selected.filename ?? input.filename,
      format:
        getAttachmentExtension(selected.filename ?? input.filename) ?? "txt",
      mediaType:
        normalizeAttachmentMimeType(selected.mediaType) ??
        inferAttachmentMimeType(selected.filename ?? input.filename),
      sourceKind: "message_attachment",
    };
  }

  throw new Error(
    `Attachment "${input.filename}" uses an unsupported source URL.`,
  );
}

async function resolveWorkspaceDocumentSource(
  runtime: DocumentLoadRuntime,
  input: Extract<DocumentLoadInput, { source: "workspace_path" }>,
): Promise<ResolvedDocumentSource> {
  const { resolvedPath } = resolveToolPath({
    defaultDirectory: runtime.defaultDirectory,
    ...(runtime.extraAllowedRoots
      ? { extraAllowedRoots: runtime.extraAllowedRoots }
      : {}),
    permissionMode: runtime.permissionMode,
    requestedPath: input.path,
    toolName: "load_document",
  });
  const filename = path.basename(resolvedPath);

  return {
    data: await readFile(resolvedPath),
    filename,
    format: getAttachmentExtension(filename) ?? "txt",
    mediaType: inferAttachmentMimeType(filename),
    sourceKind: "workspace_path",
  };
}

function getCacheKey(source: ResolvedDocumentSource, maxChars: number) {
  return createHash("sha256")
    .update(CACHE_NAMESPACE)
    .update(source.sourceKind)
    .update("\0")
    .update(source.filename)
    .update("\0")
    .update(source.mediaType)
    .update("\0")
    .update(String(maxChars))
    .update("\0")
    .update(source.data)
    .digest("hex");
}

async function loadResolvedDocument(
  source: ResolvedDocumentSource,
  maxChars: number,
): Promise<DocumentLoadResult> {
  const cacheKey = getCacheKey(source, maxChars);
  const cached = documentCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const pending = (async () => {
    const extracted = await extractDocument(source);
    const warnings = [...(extracted.warnings ?? [])];
    const truncatedContent = truncateContent(
      collapseBlankLines(extracted.content),
      maxChars,
    );

    if (truncatedContent.truncated) {
      warnings.push("Content was truncated to fit chat limits.");
    }

    return {
      content: truncatedContent.content,
      filename: source.filename,
      format: source.format,
      mediaType: source.mediaType,
      ...(extracted.sheetNames ? { sheetNames: extracted.sheetNames } : {}),
      ...(extracted.slideCount !== undefined
        ? { slideCount: extracted.slideCount }
        : {}),
      sourceKind: source.sourceKind,
      truncated:
        truncatedContent.truncated ||
        extracted.truncated === true ||
        warnings.length > 0,
      warnings,
    } satisfies DocumentLoadResult;
  })().catch((error) => {
    if (documentCache.get(cacheKey) === pending) {
      documentCache.delete(cacheKey);
    }
    throw error;
  });

  documentCache.set(cacheKey, pending);
  return await pending;
}

export async function loadDocument(
  input: DocumentLoadInput,
  runtime: DocumentLoadRuntime,
  maxChars = DEFAULT_MAX_CHARS,
) {
  const normalizedMaxChars = Math.min(MAX_ALLOWED_CHARS, Math.max(1, maxChars));
  const source =
    input.source === "workspace_path"
      ? await resolveWorkspaceDocumentSource(runtime, input)
      : await resolveMessageAttachmentSource(runtime, input);

  return await loadResolvedDocument(source, normalizedMaxChars);
}

export async function loadInlineAttachmentDocument(input: {
  filename: string;
  maxChars?: number;
  mediaType?: string | null;
  sourceKind?: DocumentSourceKind;
  url: string;
}) {
  let resolved: ResolvedDocumentSource;

  if (input.url.startsWith("data:")) {
    const parsed = decodeDataUrl(input.url);
    resolved = {
      data: parsed.data,
      filename: input.filename,
      format: getAttachmentExtension(input.filename) ?? "txt",
      mediaType:
        normalizeAttachmentMimeType(parsed.mediaType) ??
        normalizeAttachmentMimeType(input.mediaType) ??
        inferAttachmentMimeType(input.filename),
      sourceKind: input.sourceKind ?? "message_attachment",
    };
  } else if (path.isAbsolute(input.url)) {
    resolved = {
      data: await readFile(input.url),
      filename: input.filename,
      format: getAttachmentExtension(input.filename) ?? "txt",
      mediaType:
        normalizeAttachmentMimeType(input.mediaType) ??
        inferAttachmentMimeType(input.filename),
      sourceKind: input.sourceKind ?? "message_attachment",
    };
  } else {
    throw new Error(
      `Inline attachment "${input.filename}" uses an unsupported source URL.`,
    );
  }

  return await loadResolvedDocument(
    resolved,
    Math.min(
      MAX_ALLOWED_CHARS,
      Math.max(1, input.maxChars ?? DEFAULT_MAX_CHARS),
    ),
  );
}

export function buildDocumentModelText(result: DocumentLoadResult) {
  const lines = [
    `Document: ${result.filename}`,
    `Source: ${result.sourceKind}`,
    `Format: ${result.format}`,
    `Media type: ${result.mediaType}`,
    ...(result.sheetNames?.length
      ? [`Sheets: ${result.sheetNames.join(", ")}`]
      : []),
    ...(result.slideCount !== undefined
      ? [`Slides: ${result.slideCount}`]
      : []),
    ...(result.warnings.length > 0
      ? [`Warnings: ${result.warnings.join(" | ")}`]
      : []),
    "",
    result.content,
  ];

  return lines.join("\n");
}

export const __internal = {
  DEFAULT_MAX_CHARS,
  MAX_ALLOWED_CHARS,
  decodeDataUrl,
  ensurePdfJsNodePolyfills,
  resetModuleImportersForTests() {
    importPersistenceModule = async () =>
      await import("@/lib/ai/chat/persistence");
    importBranchesModule = async () =>
      await import("@/lib/ai/messages/branches");
  },
  renderOfficeNodes,
  renderPlainTextAsMarkdown,
  renderSheetTable,
  renderSpreadsheet,
  renderPptxSlides,
  setModuleImportersForTests(input: {
    branches?: () => Promise<BranchesModule>;
    persistence?: () => Promise<PersistenceModule>;
  }) {
    if (input.persistence) {
      importPersistenceModule = input.persistence;
    }

    if (input.branches) {
      importBranchesModule = input.branches;
    }
  },
  truncateContent,
};

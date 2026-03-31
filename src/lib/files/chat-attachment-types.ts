const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
] as const;

const TEXT_DOCUMENT_EXTENSIONS = ["txt", "md", "json", "csv"] as const;
const CODE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "css",
  "html",
  "xml",
  "yaml",
  "yml",
  "toml",
  "sql",
  "sh",
] as const;
const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "rtf", "odt"] as const;
const SPREADSHEET_EXTENSIONS = ["xls", "xlsx", "ods", "csv"] as const;
const PRESENTATION_EXTENSIONS = ["ppt", "pptx", "odp"] as const;
const ARCHIVE_EXTENSIONS = ["zip", "rar", "7z", "tar", "gz"] as const;
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac", "aac"] as const;
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv", "wmv"] as const;

export const SUPPORTED_CHAT_ATTACHMENT_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...TEXT_DOCUMENT_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...SPREADSHEET_EXTENSIONS,
  ...PRESENTATION_EXTENSIONS,
] as const;

export const CHAT_ATTACHMENT_ACCEPT = SUPPORTED_CHAT_ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export type AttachmentDisplayType =
  | "image"
  | "pdf"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx"
  | "csv"
  | "md"
  | "text"
  | "code"
  | "zip"
  | "audio"
  | "video"
  | "default";

export type AttachmentKind =
  | "image"
  | "document"
  | "code-text"
  | "archive"
  | "audio"
  | "video"
  | "unknown";

export type AttachmentDetectionResult = {
  confidence: "high" | "medium" | "low";
  displayType: AttachmentDisplayType;
  extension: string | null;
  isImagePreviewable: boolean;
  isSupportedInChat: boolean;
  kind: AttachmentKind;
  label: string;
  language?: string;
  mediaType: string;
};

const EXTENSION_TO_MIME: Record<string, string> = {
  // Images
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  // Text/docs
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  // Code/config
  c: "text/x-c",
  cpp: "text/x-c++",
  css: "text/css",
  go: "text/x-go",
  html: "text/html",
  java: "text/x-java",
  js: "text/javascript",
  jsx: "text/javascript",
  py: "text/x-python",
  rb: "application/x-ruby",
  rs: "text/x-rust",
  sh: "application/x-sh",
  sql: "application/sql",
  toml: "text/x-toml",
  ts: "application/typescript",
  tsx: "application/typescript",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  // Documents
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  rtf: "application/rtf",
  // Sheets
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Presentations
  odp: "application/vnd.oasis.opendocument.presentation",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Future-recognized
  "7z": "application/x-7z-compressed",
  avi: "video/x-msvideo",
  flac: "audio/flac",
  gz: "application/gzip",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  rar: "application/x-rar-compressed",
  tar: "application/x-tar",
  wav: "audio/wav",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
  zip: "application/zip",
};

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const EXTENSION_TO_DISPLAY_TYPE: Record<string, AttachmentDisplayType> = {
  bmp: "image",
  c: "code",
  cpp: "code",
  css: "code",
  csv: "csv",
  doc: "doc",
  docx: "docx",
  gif: "image",
  go: "code",
  html: "code",
  ico: "image",
  java: "code",
  jpeg: "image",
  jpg: "image",
  js: "code",
  json: "code",
  jsx: "code",
  md: "md",
  mp3: "audio",
  mp4: "video",
  odt: "doc",
  ods: "xls",
  odp: "ppt",
  pdf: "pdf",
  png: "image",
  ppt: "ppt",
  pptx: "pptx",
  py: "code",
  rar: "zip",
  rb: "code",
  rs: "code",
  rtf: "doc",
  sh: "code",
  sql: "code",
  svg: "image",
  tar: "zip",
  toml: "code",
  ts: "code",
  tsx: "code",
  txt: "text",
  webm: "video",
  webp: "image",
  xls: "xls",
  xlsx: "xlsx",
  xml: "code",
  yaml: "code",
  yml: "code",
  zip: "zip",
};

const MIME_TO_DISPLAY_TYPE: Record<string, AttachmentDisplayType> = {
  "application/json": "code",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/rtf": "doc",
  "application/sql": "code",
  "application/typescript": "code",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.presentation": "ppt",
  "application/vnd.oasis.opendocument.spreadsheet": "xls",
  "application/vnd.oasis.opendocument.text": "doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/x-7z-compressed": "zip",
  "application/x-rar-compressed": "zip",
  "application/x-ruby": "code",
  "application/x-sh": "code",
  "application/xml": "code",
  "application/zip": "zip",
  "image/bmp": "image",
  "image/gif": "image",
  "image/jpeg": "image",
  "image/png": "image",
  "image/svg+xml": "image",
  "image/webp": "image",
  "text/csv": "csv",
  "text/html": "code",
  "text/javascript": "code",
  "text/markdown": "md",
  "text/plain": "text",
  "text/x-c": "code",
  "text/x-c++": "code",
  "text/x-go": "code",
  "text/x-java": "code",
  "text/x-python": "code",
  "text/x-rust": "code",
  "text/x-toml": "code",
  "text/yaml": "code",
};

export type AttachmentIconKey =
  | "audio"
  | "code"
  | "csv"
  | "default"
  | "doc"
  | "image"
  | "md"
  | "pdf"
  | "ppt"
  | "text"
  | "video"
  | "xls"
  | "zip";

export function getAttachmentExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? null) : null;
}

export function normalizeAttachmentMimeType(mimeType?: string | null) {
  const [normalized] = (mimeType ?? "").split(";");
  return normalized?.trim().toLowerCase() || undefined;
}

export function inferAttachmentMimeType(fileName: string) {
  const extension = getAttachmentExtension(fileName);
  return extension
    ? (EXTENSION_TO_MIME[extension] ?? "application/octet-stream")
    : "application/octet-stream";
}

function getAttachmentDisplayType(extension: string | null, mimeType?: string) {
  if (extension && EXTENSION_TO_DISPLAY_TYPE[extension]) {
    return EXTENSION_TO_DISPLAY_TYPE[extension];
  }

  if (mimeType && MIME_TO_DISPLAY_TYPE[mimeType]) {
    return MIME_TO_DISPLAY_TYPE[mimeType];
  }

  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("text/")) return "text";

  return "default";
}

function getAttachmentKind(displayType: AttachmentDisplayType): AttachmentKind {
  switch (displayType) {
    case "image":
      return "image";
    case "pdf":
    case "doc":
    case "docx":
    case "ppt":
    case "pptx":
    case "xls":
    case "xlsx":
      return "document";
    case "csv":
    case "md":
    case "text":
    case "code":
      return "code-text";
    case "zip":
      return "archive";
    case "audio":
      return "audio";
    case "video":
      return "video";
    default:
      return "unknown";
  }
}

function getAttachmentLabel(
  displayType: AttachmentDisplayType,
  extension: string | null,
) {
  if (extension) {
    return extension.toUpperCase();
  }

  switch (displayType) {
    case "image":
      return "IMAGE";
    case "text":
      return "TEXT";
    case "code":
      return "CODE";
    default:
      return "FILE";
  }
}

export function detectAttachmentType(
  fileName: string,
  mimeType?: string | null,
): AttachmentDetectionResult {
  const extension = getAttachmentExtension(fileName);
  const normalizedMimeType =
    normalizeAttachmentMimeType(mimeType) ?? inferAttachmentMimeType(fileName);
  const displayType = getAttachmentDisplayType(extension, normalizedMimeType);
  const kind = getAttachmentKind(displayType);
  const language = extension ? EXTENSION_TO_LANGUAGE[extension] : undefined;
  const isSupportedInChat =
    kind === "image" || kind === "document" || kind === "code-text";
  const confidence =
    extension && EXTENSION_TO_DISPLAY_TYPE[extension]
      ? "high"
      : normalizedMimeType && MIME_TO_DISPLAY_TYPE[normalizedMimeType]
        ? "medium"
        : "low";

  return {
    confidence,
    displayType,
    extension,
    isImagePreviewable: displayType === "image",
    isSupportedInChat,
    kind,
    label: getAttachmentLabel(displayType, extension),
    language,
    mediaType: normalizedMimeType,
  };
}

export function getAttachmentIcon(
  result: Pick<AttachmentDetectionResult, "displayType" | "language">,
): AttachmentIconKey {
  switch (result.displayType) {
    case "audio":
      return "audio";
    case "code":
      return "code";
    case "csv":
      return "csv";
    case "doc":
    case "docx":
      return "doc";
    case "image":
      return "image";
    case "md":
      return "md";
    case "pdf":
      return "pdf";
    case "ppt":
    case "pptx":
      return "ppt";
    case "text":
      return "text";
    case "video":
      return "video";
    case "xls":
    case "xlsx":
      return "xls";
    case "zip":
      return "zip";
    default:
      return "default";
  }
}

export function getAttachmentTone(displayType: AttachmentDisplayType) {
  switch (displayType) {
    case "pdf":
      return {
        backgroundClassName: "bg-red-100 dark:bg-red-500/10",
        textClassName: "text-red-600 dark:text-red-200/80",
      };
    case "doc":
    case "docx":
      return {
        backgroundClassName: "bg-sky-100 dark:bg-sky-500/10",
        textClassName: "text-sky-600 dark:text-sky-200/80",
      };
    case "xls":
    case "xlsx":
    case "csv":
      return {
        backgroundClassName: "bg-emerald-100 dark:bg-emerald-500/10",
        textClassName: "text-emerald-600 dark:text-emerald-200/80",
      };
    case "ppt":
    case "pptx":
      return {
        backgroundClassName: "bg-amber-100 dark:bg-amber-500/10",
        textClassName: "text-amber-600 dark:text-amber-200/80",
      };
    case "md":
    case "text":
      return {
        backgroundClassName: "bg-foreground/5",
        textClassName: "text-foreground/60",
      };
    case "code":
      return {
        backgroundClassName: "bg-violet-100 dark:bg-violet-500/10",
        textClassName: "text-violet-600 dark:text-violet-200/80",
      };
    default:
      return {
        backgroundClassName: "bg-foreground/5",
        textClassName: "text-foreground/60",
      };
  }
}

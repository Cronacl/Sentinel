import path from "node:path";

export const FORCE_NORMALIZED_DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "odt",
  "ods",
  "odp",
  "ppt",
  "pptx",
  "rtf",
  "xls",
  "xlsx",
]);

export const READ_REJECTED_DOCUMENT_EXTENSIONS = new Set([
  ...FORCE_NORMALIZED_DOCUMENT_EXTENSIONS,
  "pdf",
]);

export function getLowercaseExtension(filePath: string) {
  return path.extname(filePath).toLowerCase().slice(1);
}

export function isDocumentLoaderOnlyPath(filePath: string) {
  const extension = getLowercaseExtension(filePath);
  return (
    extension.length > 0 && READ_REJECTED_DOCUMENT_EXTENSIONS.has(extension)
  );
}

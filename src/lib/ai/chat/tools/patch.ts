import { readFile } from "node:fs/promises";

type PatchChunk = {
  changeContext?: string;
  isEndOfFile?: boolean;
  newLines: string[];
  oldLines: string[];
};

export type PatchHunk =
  | { contents: string; path: string; type: "add" }
  | { path: string; type: "delete" }
  | { chunks: PatchChunk[]; movePath?: string; path: string; type: "update" };

function parsePatchHeader(
  lines: string[],
  startIndex: number,
): { filePath: string; movePath?: string; nextIndex: number } | null {
  const line = lines[startIndex];

  if (!line) return null;

  if (line.startsWith("*** Add File:")) {
    const filePath = line.slice("*** Add File:".length).trim();
    return filePath ? { filePath, nextIndex: startIndex + 1 } : null;
  }

  if (line.startsWith("*** Delete File:")) {
    const filePath = line.slice("*** Delete File:".length).trim();
    return filePath ? { filePath, nextIndex: startIndex + 1 } : null;
  }

  if (line.startsWith("*** Update File:")) {
    const filePath = line.slice("*** Update File:".length).trim();
    let nextIndex = startIndex + 1;
    let movePath: string | undefined;

    if (lines[nextIndex]?.startsWith("*** Move to:")) {
      movePath = lines[nextIndex]?.slice("*** Move to:".length).trim();
      nextIndex += 1;
    }

    return filePath ? { filePath, movePath, nextIndex } : null;
  }

  return null;
}

function parseAddContents(lines: string[], startIndex: number) {
  let nextIndex = startIndex;
  const chunks: string[] = [];

  while (nextIndex < lines.length && !lines[nextIndex]?.startsWith("***")) {
    const line = lines[nextIndex] ?? "";
    if (!line.startsWith("+")) {
      throw new Error("Add-file lines must start with '+'.");
    }
    chunks.push(line.slice(1));
    nextIndex += 1;
  }

  return {
    content: chunks.join("\n"),
    nextIndex,
  };
}

function parseUpdateChunks(lines: string[], startIndex: number) {
  const chunks: PatchChunk[] = [];
  let nextIndex = startIndex;

  while (nextIndex < lines.length && !lines[nextIndex]?.startsWith("***")) {
    const header = lines[nextIndex] ?? "";
    if (!header.startsWith("@@")) {
      nextIndex += 1;
      continue;
    }

    const changeContext = header.slice(2).trim() || undefined;
    nextIndex += 1;
    const oldLines: string[] = [];
    const newLines: string[] = [];
    let isEndOfFile = false;

    while (nextIndex < lines.length) {
      const line = lines[nextIndex] ?? "";

      if (line === "*** End of File") {
        isEndOfFile = true;
        nextIndex += 1;
        break;
      }

      if (line.startsWith("@@") || line.startsWith("***")) {
        break;
      }

      if (line.startsWith(" ")) {
        const value = line.slice(1);
        oldLines.push(value);
        newLines.push(value);
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else {
        throw new Error(`Invalid patch line: ${line}`);
      }

      nextIndex += 1;
    }

    chunks.push({
      ...(changeContext ? { changeContext } : {}),
      ...(isEndOfFile ? { isEndOfFile: true } : {}),
      newLines,
      oldLines,
    });
  }

  return { chunks, nextIndex };
}

export function parsePatch(patchText: string): { hunks: PatchHunk[] } {
  const lines = patchText.trim().split("\n");
  const beginIndex = lines.findIndex(
    (line) => line.trim() === "*** Begin Patch",
  );
  const endIndex = lines.findIndex((line) => line.trim() === "*** End Patch");

  if (beginIndex === -1 || endIndex === -1 || beginIndex >= endIndex) {
    throw new Error("Invalid patch format: missing Begin/End markers");
  }

  const hunks: PatchHunk[] = [];
  let index = beginIndex + 1;

  while (index < endIndex) {
    const header = parsePatchHeader(lines, index);
    if (!header) {
      index += 1;
      continue;
    }

    if (lines[index]?.startsWith("*** Add File:")) {
      const { content, nextIndex } = parseAddContents(lines, header.nextIndex);
      hunks.push({
        contents: content,
        path: header.filePath,
        type: "add",
      });
      index = nextIndex;
      continue;
    }

    if (lines[index]?.startsWith("*** Delete File:")) {
      hunks.push({
        path: header.filePath,
        type: "delete",
      });
      index = header.nextIndex;
      continue;
    }

    const { chunks, nextIndex } = parseUpdateChunks(lines, header.nextIndex);
    hunks.push({
      chunks,
      ...(header.movePath ? { movePath: header.movePath } : {}),
      path: header.filePath,
      type: "update",
    });
    index = nextIndex;
  }

  return { hunks };
}

function normalizeUnicode(value: string) {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function tryMatch(
  lines: string[],
  pattern: string[],
  startIndex: number,
  eof: boolean,
  compare: (left: string, right: string) => boolean,
) {
  if (eof) {
    const fromEnd = lines.length - pattern.length;
    if (fromEnd >= startIndex) {
      const matches = pattern.every((value, index) =>
        compare(lines[fromEnd + index] ?? "", value),
      );
      if (matches) return fromEnd;
    }
  }

  for (
    let index = startIndex;
    index <= lines.length - pattern.length;
    index += 1
  ) {
    const matches = pattern.every((value, offset) =>
      compare(lines[index + offset] ?? "", value),
    );
    if (matches) return index;
  }

  return -1;
}

function seekSequence(
  lines: string[],
  pattern: string[],
  startIndex: number,
  eof = false,
) {
  if (pattern.length === 0) return -1;

  const comparators = [
    (left: string, right: string) => left === right,
    (left: string, right: string) => left.trimEnd() === right.trimEnd(),
    (left: string, right: string) => left.trim() === right.trim(),
    (left: string, right: string) =>
      normalizeUnicode(left.trim()) === normalizeUnicode(right.trim()),
  ];

  for (const compare of comparators) {
    const match = tryMatch(lines, pattern, startIndex, eof, compare);
    if (match !== -1) return match;
  }

  return -1;
}

export function deriveNewContentsFromChunks(
  currentContent: string,
  chunks: PatchChunk[],
) {
  const originalLines = currentContent.split("\n");
  if (originalLines.at(-1) === "") {
    originalLines.pop();
  }

  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const contextIndex = seekSequence(
        originalLines,
        [chunk.changeContext],
        lineIndex,
      );
      if (contextIndex === -1) {
        throw new Error(`Failed to find context '${chunk.changeContext}'.`);
      }
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push([lineIndex, 0, chunk.newLines]);
      continue;
    }

    let pattern = chunk.oldLines;
    let nextLines = chunk.newLines;
    let match = seekSequence(
      originalLines,
      pattern,
      lineIndex,
      chunk.isEndOfFile === true,
    );

    if (match === -1 && pattern.at(-1) === "") {
      pattern = pattern.slice(0, -1);
      nextLines = nextLines.at(-1) === "" ? nextLines.slice(0, -1) : nextLines;
      match = seekSequence(
        originalLines,
        pattern,
        lineIndex,
        chunk.isEndOfFile === true,
      );
    }

    if (match === -1) {
      throw new Error(
        `Failed to find expected lines:\n${chunk.oldLines.join("\n")}`,
      );
    }

    replacements.push([match, pattern.length, nextLines]);
    lineIndex = match + pattern.length;
  }

  const nextLines = [...originalLines];
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const [start, deleteCount, insertLines] = replacements[index]!;
    nextLines.splice(start, deleteCount, ...insertLines);
  }

  if (nextLines.length === 0 || nextLines.at(-1) !== "") {
    nextLines.push("");
  }

  return nextLines.join("\n");
}

export async function readPatchTarget(resolvedPath: string) {
  return await readFile(resolvedPath, "utf8");
}

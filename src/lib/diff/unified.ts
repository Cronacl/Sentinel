export type DiffOp =
  | { kind: "equal"; line: string }
  | { kind: "delete"; line: string }
  | { kind: "insert"; line: string };

type NumberedDiffOp = DiffOp & {
  newLine: number | null;
  oldLine: number | null;
};

type HunkRange = {
  end: number;
  start: number;
};

export type UnifiedDiffResult = {
  additions: number;
  deletions: number;
  diff: string;
};

function splitLines(value: string) {
  return value.replaceAll("\r\n", "\n").split("\n");
}

function countContextBackward(ops: DiffOp[], index: number, maxCount: number) {
  let count = 0;
  let cursor = index - 1;

  while (cursor >= 0 && count < maxCount) {
    if (ops[cursor]?.kind !== "equal") break;
    count += 1;
    cursor -= 1;
  }

  return count;
}

function countContextForward(ops: DiffOp[], index: number, maxCount: number) {
  let count = 0;
  let cursor = index + 1;

  while (cursor < ops.length && count < maxCount) {
    if (ops[cursor]?.kind !== "equal") break;
    count += 1;
    cursor += 1;
  }

  return count;
}

function formatRange(start: number, length: number) {
  if (length === 1) return `${start}`;
  return `${start},${length}`;
}

export function diffLines(before: string, after: string): DiffOp[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const rowCount = beforeLines.length;
  const colCount = afterLines.length;

  const matrix: number[][] = Array.from({ length: rowCount + 1 }, () =>
    new Array<number>(colCount + 1).fill(0),
  );

  for (let row = rowCount - 1; row >= 0; row -= 1) {
    for (let col = colCount - 1; col >= 0; col -= 1) {
      matrix[row]![col] =
        beforeLines[row] === afterLines[col]
          ? matrix[row + 1]![col + 1]! + 1
          : Math.max(matrix[row + 1]![col]!, matrix[row]![col + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let row = 0;
  let col = 0;

  while (row < rowCount && col < colCount) {
    if (beforeLines[row] === afterLines[col]) {
      ops.push({ kind: "equal", line: beforeLines[row]! });
      row += 1;
      col += 1;
      continue;
    }

    if (matrix[row + 1]![col]! >= matrix[row]![col + 1]!) {
      ops.push({ kind: "delete", line: beforeLines[row]! });
      row += 1;
      continue;
    }

    ops.push({ kind: "insert", line: afterLines[col]! });
    col += 1;
  }

  while (row < rowCount) {
    ops.push({ kind: "delete", line: beforeLines[row]! });
    row += 1;
  }

  while (col < colCount) {
    ops.push({ kind: "insert", line: afterLines[col]! });
    col += 1;
  }

  return ops;
}

function numberOps(ops: DiffOp[]): NumberedDiffOp[] {
  const numbered: NumberedDiffOp[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const op of ops) {
    if (op.kind === "equal") {
      numbered.push({ ...op, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (op.kind === "delete") {
      numbered.push({ ...op, oldLine, newLine: null });
      oldLine += 1;
      continue;
    }

    numbered.push({ ...op, oldLine: null, newLine });
    newLine += 1;
  }

  return numbered;
}

function buildHunkRanges(ops: DiffOp[], contextLines: number): HunkRange[] {
  const ranges: HunkRange[] = [];

  for (let index = 0; index < ops.length; index += 1) {
    if (ops[index]?.kind === "equal") continue;

    const start = Math.max(
      0,
      index - countContextBackward(ops, index, contextLines),
    );
    const end = Math.min(
      ops.length - 1,
      index + countContextForward(ops, index, contextLines),
    );
    const lastRange = ranges[ranges.length - 1];

    if (lastRange && start <= lastRange.end + 1) {
      lastRange.end = Math.max(lastRange.end, end);
      continue;
    }

    ranges.push({ start, end });
  }

  return ranges;
}

function buildHunkHeader(ops: NumberedDiffOp[]) {
  const oldValues = ops.flatMap((op) =>
    op.oldLine == null ? [] : [op.oldLine],
  );
  const newValues = ops.flatMap((op) =>
    op.newLine == null ? [] : [op.newLine],
  );
  const oldStart = oldValues[0] ?? 0;
  const newStart = newValues[0] ?? 0;
  const oldLength = ops.filter((op) => op.kind !== "insert").length;
  const newLength = ops.filter((op) => op.kind !== "delete").length;

  return `@@ -${formatRange(oldStart, oldLength)} +${formatRange(newStart, newLength)} @@`;
}

export function createUnifiedDiff({
  before,
  after,
  contextLines = 3,
  leftPath,
  rightPath,
}: {
  after: string;
  before: string;
  contextLines?: number;
  leftPath: string;
  rightPath: string;
}): UnifiedDiffResult {
  const ops = diffLines(before, after);
  const additions = ops.filter((op) => op.kind === "insert").length;
  const deletions = ops.filter((op) => op.kind === "delete").length;

  if (additions === 0 && deletions === 0) {
    return { additions, deletions, diff: "" };
  }

  const numbered = numberOps(ops);
  const hunks = buildHunkRanges(ops, Math.max(0, contextLines));
  const lines = [`--- a/${leftPath}`, `+++ b/${rightPath}`];

  for (const hunk of hunks) {
    const hunkOps = numbered.slice(hunk.start, hunk.end + 1);
    lines.push(buildHunkHeader(hunkOps));
    for (const op of hunkOps) {
      if (op.kind === "equal") {
        lines.push(` ${op.line}`);
      } else if (op.kind === "delete") {
        lines.push(`-${op.line}`);
      } else {
        lines.push(`+${op.line}`);
      }
    }
  }

  return {
    additions,
    deletions,
    diff: lines.join("\n"),
  };
}

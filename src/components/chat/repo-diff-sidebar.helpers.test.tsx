import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildRenderableDiffCacheKey,
  getInitialRenderableFileCount,
  getNextRenderableFileCount,
  parseRenderableDiffFile,
  type RepoDiffSourceFile,
} from "./repo-diff-sidebar.helpers";
import type { RepoDiffSidebarMode } from "./repo-diff-sidebar-store";

function createFile(path: string): RepoDiffSourceFile {
  return {
    additions: 1,
    deletions: 0,
    firstChangedLine: 1,
    isUntracked: false,
    newContents: "const next = 2;\n",
    oldContents: "const next = 1;\n",
    patch: `diff --git a/${path} b/${path}
index 1111111..2222222 100644
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-const next = 1;
+const next = 2;`,
    path,
  };
}

function DiffMountSummary({
  files,
  mode,
  visibleCount,
}: {
  files: RepoDiffSourceFile[];
  mode: RepoDiffSidebarMode;
  visibleCount: number;
}) {
  return (
    <div>
      {files.map((file, index) => {
        const shouldRenderDiff = index < visibleCount;
        const parsed = shouldRenderDiff
          ? parseRenderableDiffFile(mode, file)
          : null;

        return (
          <section
            data-diff-mounted={
              shouldRenderDiff && parsed?.fileDiff ? "true" : "false"
            }
            key={file.path}
          >
            {file.path}
          </section>
        );
      })}
    </div>
  );
}

describe("repo diff sidebar helpers", () => {
  it("limits the initial mounted diff renderers to the first batch", () => {
    const files = Array.from({ length: 10 }, (_, index) =>
      createFile(`file-${index + 1}.ts`),
    );

    const initialVisibleCount = getInitialRenderableFileCount(files.length);
    const expandedVisibleCount = getNextRenderableFileCount(
      initialVisibleCount,
      files.length,
    );

    const initialMarkup = renderToStaticMarkup(
      <DiffMountSummary
        files={files}
        mode="unstaged"
        visibleCount={initialVisibleCount}
      />,
    );
    const expandedMarkup = renderToStaticMarkup(
      <DiffMountSummary
        files={files}
        mode="unstaged"
        visibleCount={expandedVisibleCount}
      />,
    );

    expect(initialMarkup.match(/data-diff-mounted="true"/g)?.length ?? 0).toBe(
      6,
    );
    expect(expandedMarkup.match(/data-diff-mounted="true"/g)?.length ?? 0).toBe(
      10,
    );
  });

  it("builds a cache key from mode, path, and patch", () => {
    const file = createFile("feature.ts");

    expect(buildRenderableDiffCacheKey("unstaged", file)).toContain(
      "unstaged:feature.ts:",
    );
  });
});

import { existsSync } from "node:fs";
import path from "node:path";

import { readTextFile, writeTextFile } from "../../scripts/desktop/state.mjs";

// Electron 43+ opens dialogs in Downloads when no defaultPath is passed, where
// the OS used to reopen the last folder, even across restarts. Remember the
// folder of the last pick per dialog kind in a small file so the next dialog
// of that kind starts there again, and use the fallback (the home folder)
// until the first pick or once the remembered folder is gone.
export function createDialogDefaultPaths({ fallbackPath, filePath }) {
  let savedPaths;

  function load() {
    savedPaths ??= readTextFile(filePath)
      .then((contents) => {
        const parsed = contents ? JSON.parse(contents) : null;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      })
      .catch(() => ({}));

    return savedPaths;
  }

  return {
    async current(kind) {
      const savedPath = (await load())[kind];
      return typeof savedPath === "string" && existsSync(savedPath)
        ? savedPath
        : fallbackPath;
    },
    async remember(kind, result) {
      const [selectedPath] = result?.canceled ? [] : (result?.filePaths ?? []);
      if (!selectedPath) {
        return;
      }

      const paths = await load();
      paths[kind] = path.dirname(selectedPath);
      await writeTextFile(
        filePath,
        `${JSON.stringify(paths, null, 2)}\n`,
      ).catch((error) => {
        console.warn("[desktop] could not save dialog folders:", error);
      });
    },
  };
}

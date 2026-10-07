import path from "node:path";

// Electron 43+ opens dialogs in Downloads when no defaultPath is passed, where
// the OS used to reopen the last folder. Remember the folder of the last pick
// so the next file or folder dialog starts there again.
export function createDialogDefaultPathTracker() {
  let lastDirectory;

  return {
    current() {
      return lastDirectory;
    },
    remember(result) {
      const [selectedPath] = result?.canceled ? [] : (result?.filePaths ?? []);
      if (selectedPath) {
        lastDirectory = path.dirname(selectedPath);
      }
    },
  };
}

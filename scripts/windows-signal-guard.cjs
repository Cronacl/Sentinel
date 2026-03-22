// @ts-nocheck

if (process.platform === "win32") {
  const { ChildProcess } = require("node:child_process");

  function isWindowsKillPermissionError(error) {
    return Boolean(
      error &&
      typeof error === "object" &&
      error.code === "EPERM" &&
      error.syscall === "kill",
    );
  }

  const originalProcessKill = process.kill.bind(process);
  process.kill = function patchedProcessKill(pid, signal) {
    try {
      return originalProcessKill(pid, signal);
    } catch (error) {
      if (isWindowsKillPermissionError(error)) {
        return false;
      }
      throw error;
    }
  };

  const originalChildKill = ChildProcess.prototype.kill;
  ChildProcess.prototype.kill = function patchedChildKill(signal) {
    try {
      return originalChildKill.call(this, signal);
    } catch (error) {
      if (isWindowsKillPermissionError(error)) {
        return false;
      }
      throw error;
    }
  };
}

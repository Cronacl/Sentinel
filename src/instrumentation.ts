// Runs once when the Next server starts, before it handles any request.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Before anything can spawn a child: the Electron-only internal token and
  // an ENCRYPTION_KEY set in the environment must not be inherited by
  // agents, tools or MCP servers (lib/runtime/process/private-env.ts).
  const { captureInternalToken } = await import("@/server/http/internal-token");
  captureInternalToken();
  const { captureEncryptionKey } =
    await import("@/lib/runtime/process/private-env");
  captureEncryptionKey();
}

// Runs once when the Next server starts, before it handles any request.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Before anything can spawn a child: the Electron-only internal token
  // must not be inherited by agents, tools or MCP servers.
  const { captureInternalToken } = await import("@/server/http/internal-token");
  captureInternalToken();
}

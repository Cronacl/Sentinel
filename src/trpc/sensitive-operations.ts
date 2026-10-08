// tRPC operations whose input or result can carry credentials: sign-in
// answers, device codes and launch tickets, API keys, secret instance
// variables. The client's loggerLink never logs them (in development it
// logs every operation with its input and result, and the desktop app
// forwards the renderer console to its own output).

const SENSITIVE_OPERATION_PATHS = new Set([
  "engines.codex.login",
  "engines.instances.create",
  "engines.instances.update",
]);
const SENSITIVE_OPERATION_PREFIXES = ["engines.auth."];

export function isSensitiveTrpcOperation(path: string) {
  return (
    SENSITIVE_OPERATION_PATHS.has(path) ||
    SENSITIVE_OPERATION_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

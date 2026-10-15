// Packages next.config.js keeps out of the server bundle
// (`serverExternalPackages`). Next loads them from node_modules at runtime and
// output tracing copies them into the standalone server, so the bundle audit
// checks that each one shipped.
//   better-sqlite3, sqlite-vec: native addons.
//   @anthropic-ai/claude-agent-sdk: a prebuilt ESM bundle that locates its
//   native CLI relative to its own file (import.meta.url); it runs from its
//   package directory instead of being re-bundled.
export const SERVER_EXTERNAL_PACKAGES = [
  "better-sqlite3",
  "sqlite-vec",
  "@anthropic-ai/claude-agent-sdk",
];

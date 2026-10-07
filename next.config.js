import path from "node:path";
import { fileURLToPath } from "node:url";

import { UNTRACED_SERVER_PACKAGES } from "./scripts/desktop/untraced-server-packages.mjs";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds and CI where the home directory may not be accessible.
 */
if (!process.env.SKIP_ENV_VALIDATION) {
  await import("./src/env.js");
}

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = {
  // Next 16 `next dev` writes a managed AGENTS.md into the repo when it detects
  // a coding agent; keep dev runs from dirtying the working tree.
  agentRules: false,
  // Loopback desktop app: gzip buys nothing and Next's compression buffers
  // streamed responses (SSE chat resumes, tRPC subscriptions).
  compress: false,
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    "/**": UNTRACED_SERVER_PACKAGES.map(
      (packageName) => `./node_modules/${packageName}/**/*`,
    ),
  },
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  turbopack: {
    root: projectRoot,
  },
};

export default config;

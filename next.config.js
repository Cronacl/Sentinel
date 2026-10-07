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
  eslint: {
    ignoreDuringBuilds: true,
  },
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

import path from "node:path";
import { fileURLToPath } from "node:url";

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
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  turbopack: {
    root: projectRoot,
  },
};

export default config;

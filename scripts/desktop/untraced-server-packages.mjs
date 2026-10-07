// Packages the Next server loads through a require that file tracing cannot
// follow, so `output: "standalone"` would leave them out of the packaged
// server. next.config.js adds them to outputFileTracingIncludes and the bundle
// audit checks that they shipped.
//   undici: @ai-sdk/provider-utils (>= 4.0.45) loads it on Node with
//   module.createRequire(<bundle chunk>)("undici") for the DNS-pinned download
//   fetch, so server chunks resolve it from the top-level node_modules.
export const UNTRACED_SERVER_PACKAGES = ["undici"];

// The server-side packages that load each untraced package at runtime. The
// shipped top-level copy only has to satisfy these; build tooling such as
// node-gyp or @electron/get may depend on other majors (bun nests those).
export const UNTRACED_SERVER_PACKAGE_LOADERS = {
  undici: ["@ai-sdk/provider-utils"],
};

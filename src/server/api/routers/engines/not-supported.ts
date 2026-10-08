// What the engine sub-routers answer while the platform service behind a
// procedure is not built yet (auth flows and maintenance land in P11, the
// ACP registry in P13). A typed result rather than an error, so the UI can
// render "not available yet" without treating it as a failure.

export type EngineFeatureNotSupported = {
  code: "not_supported";
  feature: string;
  message: string;
  ok: false;
};

export function engineFeatureNotSupported(
  feature: string,
  message = "This is not available in this version of Sentinel yet.",
): EngineFeatureNotSupported {
  return { code: "not_supported", feature, message, ok: false };
}

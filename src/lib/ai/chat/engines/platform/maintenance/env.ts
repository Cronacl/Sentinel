import type { ResolvedEngineInstance } from "../../contract";

// The environment install and update commands run with. A CLI binary is
// shared by every instance of its driver, so the commands that install or
// replace it run as Sentinel's own environment (process.env with the
// managed PATH), not as one instance:
// - the instance's home variable (CODEX_HOME, CLAUDE_CONFIG_DIR, …) would
//   point an updater at that instance's state instead of the shared install
//   (`codex update` replaces <CODEX_HOME>/packages/standalone);
// - its own variables are often API keys, which npm, Homebrew, install
//   scripts and package lifecycle scripts have no use for.
// Only what decides how the command reaches the network or finds its
// programs is kept from the instance: its PATH and proxy/certificate
// variables. A definition can add what its updater needs on top
// (nativeUpdate.env, from the binary's location).

/** Instance variables a maintenance command keeps (case-insensitive). */
const KEPT_INSTANCE_VARIABLES = new Set([
  "all_proxy",
  "curl_ca_bundle",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "node_extra_ca_certs",
  "path",
  "ssl_cert_dir",
  "ssl_cert_file",
]);

export function isKeptMaintenanceVariable(name: string) {
  return KEPT_INSTANCE_VARIABLES.has(name.toLowerCase());
}

/**
 * `instance.env` without what the instance sets over the server
 * environment, except PATH and proxy/certificate variables: every other
 * override is reset to the server's value, or unset (an explicit
 * undefined, so the spawn does not fill it back in from process.env).
 */
export function buildMaintenanceEnv(
  instance: Pick<ResolvedEngineInstance, "env" | "envOverrides">,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...instance.env };
  for (const name of Object.keys(instance.envOverrides)) {
    if (isKeptMaintenanceVariable(name)) {
      continue;
    }
    env[name] = baseEnv[name];
  }
  return env;
}

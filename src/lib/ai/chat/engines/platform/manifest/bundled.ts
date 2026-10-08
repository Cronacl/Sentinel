import bundledManifestJson from "../../../../../../../manifests/engine-manifest.v1.json";
import { engineManifestSchema, type EngineManifest } from "./schema";

// The manifest shipped with this build: the offline fallback and the floor
// any cached or fetched copy must be at least as new as. It is validated at
// load, so a broken edit fails tests and the build rather than reaching
// users.

export const BUNDLED_ENGINE_MANIFEST: EngineManifest =
  engineManifestSchema.parse(bundledManifestJson);

/** Where the manifest lives in the repository (and on main for refreshes). */
export const ENGINE_MANIFEST_REPOSITORY_PATH =
  "manifests/engine-manifest.v1.json";

export const ENGINE_MANIFEST_REMOTE_URL = `https://raw.githubusercontent.com/Cronacl/Sentinel/main/${ENGINE_MANIFEST_REPOSITORY_PATH}`;

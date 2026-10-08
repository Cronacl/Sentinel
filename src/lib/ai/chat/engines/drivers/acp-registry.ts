import "server-only";

import { definePlannedEngineDriver } from "./planned";

// Slot of the ACP Registry driver, kind "acp": one instance per installed
// registry agent and no default instance (design acp-and-agents §3.4). A
// planned stub until the ACP Registry lane replaces this file and flips
// DRIVER_CATALOG.acp to "available".
export const acpRegistryDriver = definePlannedEngineDriver("acp");

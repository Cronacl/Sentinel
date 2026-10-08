import "server-only";

import { definePlannedEngineDriver } from "./planned";

// Slot of the Antigravity driver (its managed ACP server on the shared ACP
// engine, design acp-and-agents §3.3). A planned stub until the Antigravity
// lane replaces this file and flips DRIVER_CATALOG.antigravity to
// "available".
export const antigravityDriver = definePlannedEngineDriver("antigravity");

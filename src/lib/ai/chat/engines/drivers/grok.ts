import "server-only";

import { definePlannedEngineDriver } from "./planned";

// Slot of the Grok Build driver (`grok agent stdio` on the shared ACP engine,
// design acp-and-agents §3.2). A planned stub until the Grok lane replaces
// this file and flips DRIVER_CATALOG.grok to "available".
export const grokDriver = definePlannedEngineDriver("grok");

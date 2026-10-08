import "server-only";

import { definePlannedEngineDriver } from "./planned";

// Slot of the Pi driver (`pi --mode rpc`, design acp-and-agents §4). A
// planned stub until the Pi lane replaces this file and flips
// DRIVER_CATALOG.pi to "available".
export const piDriver = definePlannedEngineDriver("pi");

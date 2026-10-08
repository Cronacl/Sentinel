import "server-only";

import { isAvailableDriverKind } from "../catalog";
import { acpRegistryDriver } from "../drivers/acp-registry";
import { antigravityDriver } from "../drivers/antigravity";
import { claudeDriver } from "../drivers/claude";
import { codexDriver } from "../drivers/codex";
import { copilotDriver } from "../drivers/copilot";
import { cursorDriver } from "../drivers/cursor";
import { grokDriver } from "../drivers/grok";
import { openCodeDriver } from "../drivers/opencode";
import { piDriver } from "../drivers/pi";
import { sentinelDriver } from "../drivers/sentinel";
import type { EngineDriver } from "./driver";

// The only fan-in list of server drivers, one per builtin kind in catalog
// order: adding a driver is one import and one entry here (see
// design/driver-contract.md §9). A kind the catalog still marks "planned"
// is listed with its stub (drivers/planned.ts); it lands by replacing its
// own drivers/<kind>.ts and flipping its catalog status, without touching
// this list. Only implemented kinds resolve: planned and unknown kinds get
// null, so their instances are reported unavailable and never dispatched.

export const SERVER_DRIVERS: readonly EngineDriver[] = [
  sentinelDriver,
  codexDriver,
  claudeDriver,
  copilotDriver,
  cursorDriver,
  openCodeDriver,
  grokDriver,
  antigravityDriver,
  piDriver,
  acpRegistryDriver,
];

const DRIVERS_BY_KIND = new Map<string, EngineDriver>(
  SERVER_DRIVERS.filter((driver) => isAvailableDriverKind(driver.kind)).map(
    (driver) => [driver.kind, driver],
  ),
);

export function getEngineDriver(kind: string): EngineDriver | null {
  return DRIVERS_BY_KIND.get(kind) ?? null;
}

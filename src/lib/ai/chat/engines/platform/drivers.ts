import "server-only";

import { claudeDriver } from "../drivers/claude";
import { codexDriver } from "../drivers/codex";
import { copilotDriver } from "../drivers/copilot";
import { cursorDriver } from "../drivers/cursor";
import { openCodeDriver } from "../drivers/opencode";
import { sentinelDriver } from "../drivers/sentinel";
import type { EngineDriver } from "./driver";

// The only fan-in list of server drivers: adding a driver is one import and
// one entry here (see design/driver-contract.md §9). Kinds without a driver
// (planned or unknown) resolve to null and their instances are reported
// unavailable.

export const SERVER_DRIVERS: readonly EngineDriver[] = [
  sentinelDriver,
  codexDriver,
  claudeDriver,
  copilotDriver,
  cursorDriver,
  openCodeDriver,
];

const DRIVERS_BY_KIND = new Map<string, EngineDriver>(
  SERVER_DRIVERS.map((driver) => [driver.kind, driver]),
);

export function getEngineDriver(kind: string): EngineDriver | null {
  return DRIVERS_BY_KIND.get(kind) ?? null;
}

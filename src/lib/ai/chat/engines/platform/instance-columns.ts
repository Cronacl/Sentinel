import { sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import {
  toStoredEngineInstanceId,
  type DriverKind,
  type EngineInstanceId,
} from "../contract";

/** What a NULL engine column means (user.default_chat_engine). */
const DEFAULT_ENGINE: DriverKind = "sentinel";

/**
 * The SET value for a chat_engine_instance_id column written together with
 * its engine column (thread, automation, user default). An instance belongs
 * to one driver, so a row never keeps an instance across a driver change:
 *
 * - with `instanceId`, the row is rebound (the default instance is stored as
 *   NULL);
 * - without it, the stored instance is kept while the write leaves the driver
 *   unchanged and cleared (default instance) when it changes the driver.
 *
 * SET expressions see the row as it was before the update, so no read is
 * needed first.
 */
export function engineInstanceIdForEngineWrite(input: {
  engine: DriverKind;
  engineColumn: AnySQLiteColumn;
  instanceColumn: AnySQLiteColumn;
  instanceId?: EngineInstanceId | null;
}): SQL | EngineInstanceId | null {
  if (input.instanceId !== undefined) {
    return toStoredEngineInstanceId(input.engine, input.instanceId);
  }

  return sql`CASE WHEN COALESCE(${input.engineColumn}, ${DEFAULT_ENGINE}) = ${input.engine} THEN ${input.instanceColumn} ELSE NULL END`;
}

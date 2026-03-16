"use client";

import { createDbExecuteTool } from "../shared/db-mutation-view";

export const MysqlExecuteTool = createDbExecuteTool("mysql", "MySQL");

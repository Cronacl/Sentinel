"use client";

import { createDbQueryTool } from "../shared/db-query-view";

export const PgQueryTool = createDbQueryTool("postgresql", "PostgreSQL");

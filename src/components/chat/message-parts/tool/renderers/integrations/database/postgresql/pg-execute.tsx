"use client";

import { createDbExecuteTool } from "../shared/db-mutation-view";

export const PgExecuteTool = createDbExecuteTool("postgresql", "PostgreSQL");

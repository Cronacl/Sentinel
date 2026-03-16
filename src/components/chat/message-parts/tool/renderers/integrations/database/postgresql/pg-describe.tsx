"use client";

import { createDbDescribeTool } from "../shared/db-describe-view";

export const PgDescribeTool = createDbDescribeTool("postgresql", "PostgreSQL");

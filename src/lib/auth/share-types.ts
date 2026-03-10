import type { InferSelectModel } from "drizzle-orm";

import type { users } from "@/server/db/schema";

export type MiddlewareUser = InferSelectModel<typeof users> | null;

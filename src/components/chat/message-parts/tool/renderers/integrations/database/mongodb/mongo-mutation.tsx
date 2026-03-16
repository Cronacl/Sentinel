"use client";

import { createDbMongoMutationTool } from "../shared/db-mutation-view";

export const MongoMutationTool = createDbMongoMutationTool(
  "mongodb",
  "MongoDB",
);

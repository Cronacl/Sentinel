import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    ENCRYPTION_KEY: z
      .string()
      .length(64, "ENCRYPTION_KEY must be a 32-byte hex string (64 chars)")
      .default(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SENTINEL_DB_PATH: z.string().optional(),
    SENTINEL_STATE_PATH: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    NODE_ENV: process.env.NODE_ENV,
    SENTINEL_DB_PATH: process.env.SENTINEL_DB_PATH,
    SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

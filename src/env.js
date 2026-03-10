import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    BETTER_AUTH_URL: z.string().url().default("http://127.0.0.1:3232"),
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    ENCRYPTION_KEY: z
      .string()
      .length(64, "ENCRYPTION_KEY must be a 32-byte hex string (64 chars)")
      .default(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    GOOGLE_CLIENT_ID: z.string().default(""),
    GOOGLE_CLIENT_SECRET: z.string().default(""),
    GOOGLE_REDIRECT_URI: z
      .string()
      .url()
      .default("http://127.0.0.1:3232/api/auth/callback/google"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SENTINEL_DB_PATH: z.string().optional(),
    SENTINEL_STATE_PATH: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_URL: z.string().url().default("http://127.0.0.1:3232"),
  },
  runtimeEnv: {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NODE_ENV: process.env.NODE_ENV,
    SENTINEL_DB_PATH: process.env.SENTINEL_DB_PATH,
    SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

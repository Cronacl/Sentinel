process.env.SENTINEL_SKIP_STARTUP_TASKS ??= "1";
process.env.SKIP_ENV_VALIDATION ??= "1";

void Promise.resolve()
  .then(() => {
    const { syncDatabaseSchema } =
      require("../../src/server/db/index.ts") as typeof import("../../src/server/db/index");
    const { getSentinelDbFilePath } =
      require("../../src/lib/runtime/local-state.ts") as typeof import("../../src/lib/runtime/local-state");

    syncDatabaseSchema();

    console.log(`Database schema synced at ${getSentinelDbFilePath()}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

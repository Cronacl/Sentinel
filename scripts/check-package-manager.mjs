const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent || userAgent.startsWith("bun/")) {
  process.exit(0);
}

console.error("This repository is Bun-managed. Use `bun install` instead of npm or pnpm.");
process.exit(1);

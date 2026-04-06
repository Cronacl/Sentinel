# Environment and build

## Environment variables

| Variable              | Required | Description                               |
| --------------------- | -------- | ----------------------------------------- |
| `ENCRYPTION_KEY`      | No       | Generated on first launch if omitted      |
| `SENTINEL_DB_PATH`    | No       | Custom path for the local SQLite database |
| `SENTINEL_STATE_PATH` | No       | Custom path for app state                 |
| `SENTINEL_APP_URL`    | No       | Override the default app URL              |

## Local development

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

## Build commands

### macOS

```bash
bun run build:desktop:mac
```

Single-architecture builds:

```bash
bun run build:desktop:mac:arm64
bun run build:desktop:mac:x64
```

### Windows

```bash
bun run build:desktop:windows
```

### Linux

```bash
bun run build:desktop:linux
```

## Related docs

- [Release process](../../release-process.md)
- [macOS signing](../../macos-signing.md)
- [Desktop platform smoke checklist](../../desktop-platform-smoke-checklist.md)

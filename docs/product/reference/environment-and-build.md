# Environment and build

## Environment variables

| Variable                 | Required | Description                                                                                     |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`         | No       | Generated on first launch if omitted                                                            |
| `SENTINEL_DB_PATH`       | No       | Custom path for the local SQLite database                                                       |
| `SENTINEL_STATE_PATH`    | No       | Custom path for app state                                                                       |
| `SENTINEL_APP_URL`       | No       | Override the default app URL                                                                    |
| `SENTINEL_LINUX_SANDBOX` | No       | Set to `true` to force Electron's Chromium sandbox when launching the Linux executable directly |

## Local development

Sentinel checks native Node dependencies before local dev, builds, preview, and start commands:

- `better-sqlite3` loads the N-API prebuild bundled for the current OS and CPU and is never compiled locally. The Linux prebuilds need glibc 2.34 and libstdc++ from GCC 11 or newer. `bun install` skips its lifecycle script (it is left out of `trustedDependencies` in `package.json`), so installs need no Python or C++ toolchain for it.
- `node-pty` uses its prebuilt binary on macOS and Windows and is compiled by `bun install` on Linux. When its binary does not load, the startup script rebuilds it from source.

`node-pty` source builds need platform build tools:

- macOS: Xcode Command Line Tools
- Linux: `build-essential`, `python3`, `make`, and `g++`
- Windows: Visual Studio Build Tools with Desktop development with C++

Linux launch notes:

- AppImage files must be executable before launch.
- Debian/Ubuntu systems may need `libfuse2` for AppImage support.
- Sentinel disables Electron's Chromium process sandbox on Linux by default because some systems do not expose user namespaces or the setuid sandbox. Linux packages also launch with `--no-sandbox` from their desktop entries. Set `SENTINEL_LINUX_SANDBOX=true` when launching the executable directly to force the sandbox back on.

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

`bun install` does not download the Electron binary (Electron 42 and later). `bun run dev:desktop` and the desktop build commands fetch it on first use, or you can run `bun run electron:install` ahead of time.

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

Single-architecture Linux builds:

```bash
bun run build:desktop:linux:arm64
bun run build:desktop:linux:x64
```

Single-target Linux builds:

```bash
bun run build:desktop:linux:appimage
bun run build:desktop:linux:deb
bun run build:desktop:linux:rpm
```

## Related docs

- [Release process](../../release-process.md)
- [macOS signing](../../macos-signing.md)
- [Desktop platform smoke checklist](../../desktop-platform-smoke-checklist.md)

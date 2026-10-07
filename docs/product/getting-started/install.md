# Install and run

You can download a release build or run Sentinel from source.

## Download a release

Release builds are published on GitHub Releases:

- [Download Sentinel](https://github.com/Cronacl/Sentinel/releases)

Current release targets:

- macOS 13 (Ventura) or later: DMG
- Windows 10 or later, 64-bit: NSIS installer
- Linux x64 and arm64 with glibc 2.34 and libstdc++ from GCC 11 or newer (for example Ubuntu 22.04, Debian 12, Fedora 35, or RHEL 9): AppImage, DEB, RPM

Sentinel runs on Electron 44, which no longer supports macOS 12, 32-bit Windows, or 32-bit ARM Linux. Copies already installed on macOS 12 keep working, but the in-app updater no longer offers them new versions.

Linux notes:

- Prefer the DEB or RPM package when it matches your distribution.
- For AppImage builds, mark the file executable before launching it.
- Some Linux systems need FUSE for AppImage support. On Debian/Ubuntu, install `libfuse2` if the AppImage does not open.
- Sentinel disables Electron's Chromium process sandbox on Linux by default for compatibility with systems where user namespaces or the setuid sandbox are unavailable. Linux packages also launch with `--no-sandbox` from their desktop entries. Set `SENTINEL_LINUX_SANDBOX=true` when launching the executable directly to force the Chromium sandbox back on.

## Run from source

Sentinel uses Bun.

Source runs also need Node.js 24 LTS (the version pinned in `.nvmrc`). Sentinel checks its native dependencies at startup:

- `better-sqlite3` loads the N-API prebuild bundled for your OS and CPU and is never compiled locally. On Linux that prebuild needs glibc 2.34 and libstdc++ from GCC 11 or newer.
- `node-pty` uses its prebuilt binary on macOS and Windows. On Linux, `bun install` compiles it. If the binary does not load, the startup script rebuilds it locally.

Linux needs `build-essential`, `python3`, `make`, and `g++` for that `node-pty` build. On macOS and Windows, install build tools only if the native repair step asks for them:

- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools with Desktop development with C++

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

The app runs at `http://localhost:3232`.

`ENCRYPTION_KEY` can be left empty in `.env`. Sentinel generates one on first desktop launch.

`bun install` does not download the Electron binary. `bun run dev:desktop` and the desktop build commands fetch it on first use, or you can run `bun run electron:install` ahead of time.

## Build commands

### macOS

```bash
bun run build:desktop:mac
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

## Related pages

- [Getting started](./index.md)
- [Quickstart](./quickstart.md)
- [Environment and build](../reference/environment-and-build.md)

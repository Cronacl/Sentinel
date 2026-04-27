# Install and run

You can download a release build or run Sentinel from source.

## Download a release

Release builds are published on GitHub Releases:

- [Download Sentinel](https://github.com/Cronacl/Sentinel/releases)

Current release targets:

- macOS: DMG
- Windows: NSIS installer
- Linux: AppImage, DEB, RPM

Linux notes:

- Prefer the DEB or RPM package when it matches your distribution.
- For AppImage builds, mark the file executable before launching it.
- Some Linux systems need FUSE for AppImage support. On Debian/Ubuntu, install `libfuse2` if the AppImage does not open.
- Sentinel disables Electron's Chromium process sandbox on Linux by default for compatibility with systems where user namespaces or the setuid sandbox are unavailable. Linux packages also launch with `--no-sandbox` from their desktop entries. Set `SENTINEL_LINUX_SANDBOX=true` when launching the executable directly to force the Chromium sandbox back on.

## Run from source

Sentinel uses Bun.

Source runs also need Node.js. Sentinel repairs native dependencies at startup by using prebuilt binaries when available and falling back to a local source build when a runtime, OS, or CPU combination does not have a matching prebuild.

Install platform build tools only if the native repair step asks for them:

- macOS: Xcode Command Line Tools
- Linux: `build-essential`, `python3`, `make`, and `g++`
- Windows: Visual Studio Build Tools with Desktop development with C++

```bash
bun install
cp .env.example .env
bun run dev:desktop
```

The app runs at `http://localhost:3232`.

`ENCRYPTION_KEY` can be left empty in `.env`. Sentinel generates one on first desktop launch.

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

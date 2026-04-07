# Install and run

You can download a release build or run Sentinel from source.

## Download a release

Release builds are published on GitHub Releases:

- [Download Sentinel](https://github.com/Cronacl/Sentinel/releases)

Current release targets:

- macOS: DMG
- Windows: NSIS installer
- Linux: AppImage, DEB, RPM

## Run from source

Sentinel uses Bun.

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

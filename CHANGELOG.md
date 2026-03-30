# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.2](https://github.com/chaqchase/Sentinel/compare/v0.0.1...v0.0.2) (2026-03-30)


### Bug Fixes

* **desktop:** disable broken private github auto-updates ([ae69a0e](https://github.com/chaqchase/Sentinel/commit/ae69a0e0bb071d3ea9c2dabac33b62e9e8858105))

## [0.0.1](https://github.com/chaqchase/Sentinel/releases/tag/v0.0.1) (2026-03-30)

### Changed

- Reset the release system to a single `0.0.x` semver channel on `main`.
- Removed alpha/stable promotion workflows and now publish only exact normal semver tags.
- Added a cheaper `desktop-verify` workflow for manual desktop packaging checks before release.
- Publish GitHub Releases from the matching `CHANGELOG.md` entry instead of GitHub-generated notes.

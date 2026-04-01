# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.6](https://github.com/chaqchase/Sentinel/compare/v0.0.5...v0.0.6) (2026-04-01)


### Features

* **chat:** enhance chat composer with engine option management and improve thread handling ([d651910](https://github.com/chaqchase/Sentinel/commit/d651910cbdc99ac5b41d1053500f5fffc8a2aa40))
* **chat:** enhance thread management with repo context integration and improve branch handling ([638e20e](https://github.com/chaqchase/Sentinel/commit/638e20ea63f49d845e4487003c07f93e74813fe3))
* **chat:** implement repo checkpoint management and enhance message action handling ([79c1d6c](https://github.com/chaqchase/Sentinel/commit/79c1d6ca3d9d8e921b71bbd90600cf90c263cb5b))

## [0.0.5](https://github.com/chaqchase/Sentinel/compare/v0.0.4...v0.0.5) (2026-03-31)


### Features

* **chat:** add loading indicator for streaming messages ([415b3d9](https://github.com/chaqchase/Sentinel/commit/415b3d90c9aed37ee81a4a6a9efd9f5c81efb687))
* **chat:** enhance chat scroll control and model selection with loading states ([54894b5](https://github.com/chaqchase/Sentinel/commit/54894b57c4acf28dc5a385407f21d0c5e1747b2e))
* **chat:** implement repo diff sidebar helpers and state management ([c82d721](https://github.com/chaqchase/Sentinel/commit/c82d721eca839d7af14cfddb741ea96e64d6bab5))
* **chat:** integrate pull request sidebar and enhance thread management with linked PR support ([6779d9d](https://github.com/chaqchase/Sentinel/commit/6779d9d8bc00bd61736d21d7164de268b62e9901))

## [0.0.4](https://github.com/chaqchase/Sentinel/compare/v0.0.3...v0.0.4) (2026-03-30)


### Bug Fixes

* **release:** set repo for fallback publish dispatch ([f81a516](https://github.com/chaqchase/Sentinel/commit/f81a51606c1d21c68beac0e779fbb4ec72f2020d))

## [0.0.3](https://github.com/chaqchase/Sentinel/compare/v0.0.2...v0.0.3) (2026-03-30)


### Bug Fixes

* **release:** avoid secrets in workflow condition ([e0ad693](https://github.com/chaqchase/Sentinel/commit/e0ad69380f1b3fdddebe02c3e02fa2ce8f1477dc))
* **release:** dispatch publish workflow for fallback token ([bcd42ec](https://github.com/chaqchase/Sentinel/commit/bcd42ec83d8134f2e0fb98a5d36cee2489c7c9cc))
* **release:** require token for publish trigger ([c5fe0eb](https://github.com/chaqchase/Sentinel/commit/c5fe0eb0715d541d1962cc37033e09069de4d031))

## [0.0.2](https://github.com/chaqchase/Sentinel/compare/v0.0.1...v0.0.2) (2026-03-30)


### Bug Fixes

* **desktop:** disable broken private github auto-updates ([ae69a0e](https://github.com/chaqchase/Sentinel/commit/ae69a0e0bb071d3ea9c2dabac33b62e9e8858105))

## [0.0.1](https://github.com/chaqchase/Sentinel/releases/tag/v0.0.1) (2026-03-30)

### Changed

- Reset the release system to a single `0.0.x` semver channel on `main`.
- Removed alpha/stable promotion workflows and now publish only exact normal semver tags.
- Added a cheaper `desktop-verify` workflow for manual desktop packaging checks before release.
- Publish GitHub Releases from the matching `CHANGELOG.md` entry instead of GitHub-generated notes.

# Release Process

Sentinel uses a conventional-commit release pipeline with local hooks, CI gates, and release automation. The process is designed to keep versioning predictable and release output clean.

## Commit And PR Discipline

- Use Conventional Commits for branch commits and pull request titles.
- The `commit-msg` hook enforces commit format locally through `commitlint`.
- CI validates pull request titles so release PRs and changelog entries remain consistent after squash merges.

Example:

```text
feat(chat): add Codex CLI fallback
```

## Local Checks

Hooks are installed automatically on `bun install` through `lefthook`.

- `pre-commit` formats staged source, config, and docs files with `prettier`.
- `commit-msg` validates the commit message.
- `pre-push` runs `bun run typecheck` and `bun run test`.

If you need to run the same checks manually:

```bash
bun run format:check
bun run typecheck
bun run test
```

## CI Gates

The main CI workflow is split into stable branch-protection jobs:

- `changes`
- `pr-metadata`
- `format`
- `typecheck`
- `test`

`changes` uses path-aware filters so docs-only pull requests skip `typecheck` and `test`.

## Alpha Releases

`main` is used for alpha releases only.

1. Merge pull requests with conventional titles into `main`.
2. The `release-please` workflow opens or updates the release PR.
3. Merging the release PR updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`, then creates the matching `vX.Y.Z-alpha.N` tag.
4. The `publish-release` workflow starts automatically from that tag, builds macOS, Windows, and Linux desktop artifacts, and attaches them to the GitHub Release.

`CHANGELOG.md` is automation-owned. Do not hand-edit it for routine releases.

## Stable Promotion

Stable promotion remains manual by design.

1. Select an approved alpha tag such as `v0.2.5-alpha.1`.
2. Run the `promote-stable` workflow with that alpha tag and the matching stable version, for example `0.2.5`.
3. Review and merge the generated stable-promotion pull request.
4. The `tag-stable-release` workflow detects the merged promotion commit, validates the release state, and creates the stable `vX.Y.Z` tag automatically when it does not already exist.
5. The `publish-release` workflow starts automatically from that stable tag and publishes the desktop artifacts as a non-prerelease GitHub Release.
6. Resume alpha releases on `main` with the next merged change or the next `release-please` cycle.

The promotion workflow is intentionally strict. It only succeeds when the selected alpha tag matches the current `main` HEAD, which keeps the promotion PR limited to version and changelog changes.

## Manual Rebuilds

`publish-release` remains manually dispatchable for rebuilds or republishing an existing release tag from a chosen ref. This is the fallback path for retries, not the normal alpha or stable release path.

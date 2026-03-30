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

## Desktop Verification

Use the `desktop-verify` workflow to test desktop packaging before a tag exists.

1. Open GitHub Actions and run `desktop-verify`.
2. Set `git_ref` to the branch, commit SHA, or tag you want to validate.
3. Leave `platforms` as `linux` for the cheapest default verification.
4. Select `mac`, `windows`, or `all` only when you need platform-specific validation.
5. Review the uploaded workflow artifacts. This workflow never creates or updates a GitHub Release.

## Releases

`main` is the only release branch.

1. Merge pull requests with conventional titles into `main`.
2. The `release-please` workflow opens or updates the release PR.
3. Merging the release PR updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`, then creates the matching `vX.Y.Z` tag.
4. The `publish-release` workflow starts automatically from that tag, builds macOS, Windows, and Linux desktop artifacts, and updates the GitHub Release using the matching `CHANGELOG.md` section as the release body.

`CHANGELOG.md` is automation-managed by `release-please`, but it is also the release-summary source of truth. Review the changelog entry in the release PR carefully before merging.

The repository currently stays on a patch-only `0.0.x` release line. Exiting that temporary policy later should require only a release-please config change, not a workflow redesign.

## Manual Rebuilds

`publish-release` remains manually dispatchable for rebuilding or republishing an existing release tag only.

- It always builds the exact tagged commit.
- It no longer accepts an override ref.
- Use `desktop-verify` for untagged branches, SHAs, or packaging fixes that still need validation before release.

# Skills

Skills are one of Sentinel's extension systems.

They let the app pull in extra capability packs without stuffing every specialized workflow into the core app.

## What skills can target

The skills UI supports these install targets:

- `sentinel`
- `claude`
- `codex`
- `copilot`
- `cursor`
- `opencode`

That matters because a skill can live in different directories depending on the target runtime.

## Scope

For local Sentinel, Claude, Copilot, Cursor, and OpenCode skills, installs can be:

- global
- workspace-scoped

Codex skills are global only.

Where each target keeps its skills:

| Target     | Workspace          | Global                                          |
| ---------- | ------------------ | ----------------------------------------------- |
| `sentinel` | `.sentinel/skills` | `~/.sentinel/skills`                            |
| `claude`   | `.claude/skills`   | `skills` in `CLAUDE_CONFIG_DIR`, or `~/.claude` |
| `codex`    | none               | Codex's own skills, through its app server      |
| `copilot`  | `.github/skills`   | `skills` in `COPILOT_HOME`, or `~/.copilot`     |
| `cursor`   | `.cursor/skills`   | `~/.cursor/skills`                              |
| `opencode` | `.opencode/skills` | `~/.config/opencode/skills`                     |

The Sentinel engine also reads `.agents/skills`, in the workspace and in your home folder.

A Claude or Copilot instance with its own home directory lists and installs global skills in that home. The composer lists the skills of the instance a thread uses.

Grok Build and Pi report their own skills, and Pi's appear in the slash menu. Sentinel does not install skills for either.

On Claude, a skill chip from a Claude skills folder is sent as Claude Code's `/name` command.

## Sources

Skills can come from:

- the curated registry
- a custom repository or path

The app keeps track of what is installed and where.

## What you can do from the skills screen

- browse installed skills
- browse curated registry entries
- inspect skill details
- install a curated skill
- install a custom skill
- uninstall a skill

For Codex-targeted skills, the app also syncs enabled state through the Codex app server manager.

## Why skills exist

Skills are the simpler way to add focused behavior without growing the main app every time.

# Engines settings

Settings → Engines is where the local coding engines live.

It shows each engine's status, version, sign-in, models, and usage. It is also where you install or update an agent, sign in, and add instances.

For what each engine needs and supports, see [Engines by agent](../engines-and-runtime/agents.md).

## Instances

An instance is one configured copy of an engine.

Each engine starts with a default instance, except ACP Registry agents, which you add one by one. Every engine except `sentinel` can have more than one instance, for example a work and a personal Codex.

Engines are grouped under driver headings. Each heading has "Add instance". Each card has a menu to edit the instance, manage its custom models, enable or disable it, remove it, or reset a default instance to its defaults. Disabling or removing an instance that threads or automations use asks first.

An instance can set:

| Field                  | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| Name and accent colour | How the instance shows in the composer, tool cards, and automations  |
| Binary path            | The executable to run. Empty means Sentinel looks for it on the PATH |
| Home directory         | The engine's own home for this instance (only engines that have one) |
| Environment variables  | Variables for the instance's processes. Secrets are stored encrypted |
| Custom models          | Extra model IDs offered in the composer for this instance            |

The composer groups its engine menu by driver when a driver has several instances. Automations pick a driver, then an instance.

### Isolated homes

Some engines keep their sign-in, settings, sessions, and skills in a home folder. Give an instance its own home directory to keep those apart:

| Engine     | Home variable       |
| ---------- | ------------------- |
| Claude     | `CLAUDE_CONFIG_DIR` |
| Codex      | `CODEX_HOME`        |
| Copilot    | `COPILOT_HOME`      |
| Grok Build | `GROK_HOME`         |

Without a home directory, the instance shares the engine's default home with your terminal.

Antigravity always runs each instance on its own private profile.

Cursor, OpenCode, Pi, and ACP Registry instances share the CLI's sign-in and settings. They differ by their environment variables (an API key, for example) and the binary they run.

Changing a Claude or Codex instance's home means its threads cannot resume their old sessions. The next turn starts a new session and sends the thread's transcript with it.

### Binary overrides from the environment

These variables still set the binary of an engine's default instance. A binary path on the instance wins.

| Engine      | Variables                                                   |
| ----------- | ----------------------------------------------------------- |
| Claude      | `SENTINEL_CLAUDE_PATH`, `CLAUDE_PATH`                       |
| Codex       | `SENTINEL_CODEX_PATH`, `CODEX_PATH`                         |
| Copilot     | `SENTINEL_COPILOT_PATH`, `COPILOT_CLI_PATH`, `COPILOT_PATH` |
| Cursor      | `SENTINEL_CURSOR_PATH`                                      |
| OpenCode    | `SENTINEL_OPENCODE_PATH`                                    |
| Pi          | `SENTINEL_PI_PATH`                                          |
| Antigravity | `SENTINEL_ANTIGRAVITY_PATH`                                 |

## Install and update

When an engine's CLI is missing, its card offers Install. When a newer version is out, or the installed one is too old for Sentinel, it offers Update.

Both open a confirmation dialog first. The dialog shows the command and the install method when there is more than one (npm, or the vendor's install script). Progress shows on the card, with Stop.

Install and update commands only get the instance's PATH and proxy or certificate variables, never its API keys or home variables.

After an install or update, Sentinel ends that instance's running processes so the new binary is used. Turns running on that instance stop; the dialog warns about this.

Copilot needs no install: its runtime is bundled with Sentinel. Antigravity is downloaded by Sentinel itself. ACP Registry agents install from the registry browser.

## Sign-in

Every instance card has a Sign-in section.

It lists the engine's sign-in methods, shows the steps of a running sign-in, and has Sign out with a confirmation. When signing out also signs out the CLI in your terminal, the confirmation says so.

Sign-in methods come in a few shapes:

- **Terminal**: the engine's own login command runs in an embedded terminal, for example `claude auth login` or `grok login`.
- **Browser or device code**: Sentinel shows the link or the code and waits.
- **API key or token**: stored as an encrypted environment variable on that instance.

If a thread's engine is signed out, the composer says "Sign in from Settings → Engines."

## Usage limits

Claude, Codex, Cursor, Grok Build, and OpenCode (for OpenCode Go) report their plan usage.

Settings → Engines has a Usage limits section, and the composer shows a usage chip next to the context ring. The chip's tooltip says when usage was read.

Sentinel reads usage in the background at most every five minutes once an instance is usable. Claude and Codex also update it live during runs. Each read is network traffic to the engine's service.

On macOS, Cursor without a token reports usage only after you allow Sentinel to read its login from the Keychain in Settings → Engines. macOS shows its own access prompt.

## Engine manifest and update checks

Sentinel ships an engine manifest: the model metadata for each engine and the CLI versions each engine supports.

By default Sentinel refreshes it from Sentinel's repository at most once an hour. If a fetch fails, it keeps the last good copy, and it never uses a copy older than the one bundled with the app.

The manifest drives version advisories on the cards:

- **Supported**: no badge.
- **Works with a warning**: the card recommends an update.
- **Unsupported**: a warning; the engine may still run.
- **Broken**: the instance cannot be used until it is updated.

Sentinel also checks for newer CLI releases once an hour, through the npm registry, or `brew info` for Homebrew installs.

Two switches in Settings → Engines control this network traffic:

| Switch                    | Off means                                  | Environment variable                    |
| ------------------------- | ------------------------------------------ | --------------------------------------- |
| Model and version updates | Use the manifest bundled with this version | `SENTINEL_DISABLE_REMOTE_MANIFEST`      |
| Check for CLI updates     | No newer-version lookups                   | `SENTINEL_DISABLE_ENGINE_UPDATE_CHECKS` |

Setting either variable to a value other than empty, `0`, `false`, `no`, or `off` turns that feature off for the whole process, and the switch shows it as locked.

Updates the compatibility advisory asks for are still offered when CLI update checks are off.

## Where engine state lives

Engine state is kept in the Sentinel state folder: the folder that holds `SENTINEL_STATE_PATH`, or `~/.sentinel` by default.

- `engines/<instance>/`: per-instance status, learned catalogs, and private homes
- `engines/settings.json`: the two network switches
- `engines/model-manifest.json`: the last fetched manifest
- `tools/`: agents Sentinel installed itself (Antigravity, ACP Registry agents)

## Related pages

- [Engines by agent](../engines-and-runtime/agents.md)
- [Providers and models](./providers-and-models.md)
- [Environment and build](../reference/environment-and-build.md)

# Engines by agent

Sentinel can run a thread on its own engine or on a coding agent installed on your machine.

The agent changes. The thread, the workspace, the repo panels, approvals, and history stay in Sentinel.

This page has one section per engine. Each section says what has to be installed, how to install it and sign in from Settings → Engines, and which thread features the engine supports.

For instances, sign-in, updates, usage limits, and the engine manifest, see [Engines settings](../configuration/engines.md).

## At a glance

| Engine       | Kind          | Permission modes            | Plan mode                   | Usage limits | Stability    |
| ------------ | ------------- | --------------------------- | --------------------------- | ------------ | ------------ |
| Sentinel     | `sentinel`    | default, full               | Native                      | No           | Stable       |
| Claude       | `claude`      | default, full               | Native                      | Yes          | Stable       |
| Codex        | `codex`       | default, full               | Native                      | Yes          | Stable       |
| Copilot      | `copilot`     | default, full               | Plan prompt                 | No           | Stable       |
| Cursor       | `cursor`      | default, accept edits, full | Cursor's plan mode          | Yes          | Stable       |
| OpenCode     | `opencode`    | default, accept edits, full | Plan agent for the turn     | OpenCode Go  | Stable       |
| Grok Build   | `grok`        | default, auto, full         | Plan prompt                 | Yes          | Experimental |
| Antigravity  | `antigravity` | default, accept edits, full | Not available               | No           | Experimental |
| Pi           | `pi`          | default, accept edits, full | Not available               | No           | Experimental |
| ACP Registry | `acp`         | default, accept edits, full | Agent's plan mode or prompt | No           | Experimental |

The composer only offers the permission modes the selected engine supports. If a thread or workspace stores a mode the engine does not have, Sentinel uses the most permissive mode the engine supports that is not above the stored one. On an engine with only default and full, accept edits and auto become default.

| Mode           | What it means                                             |
| -------------- | --------------------------------------------------------- |
| `default`      | Tools are limited to the selected workspace directory.    |
| `accept_edits` | File edits are applied without asking; other actions ask. |
| `auto`         | The agent decides which actions need your approval.       |
| `full`         | Tools can access any path on this machine.                |

Plan mode works in one of four ways:

- **Native**: the engine has its own plan mode.
- **Agent plan mode**: Sentinel switches an ACP agent into its own plan mode. Without one, it falls back to the plan prompt.
- **Plan agent**: OpenCode runs that turn with its `plan` agent.
- **Plan prompt**: Sentinel adds its plan instructions to the turn.

Where plan mode is not available, the composer hides it.

Every engine except `sentinel` supports [multiple instances](../configuration/engines.md#instances).

## Sentinel

The built-in engine. It runs on the AI SDK with the providers you connect in Settings → Providers.

- **Needs**: nothing installed. At least one connected provider.
- **Permission modes**: default, full.
- **Plan mode**: native, with the stored plan document, tasks, and question sets.
- **Usage limits**: not reported. Provider billing stays with the provider.
- **Skills**: `.sentinel/skills` and `.agents/skills`, in the workspace and in your home folder.
- **Other**: retry, regenerate, plan answers, and steering a running turn are only available on this engine.
- **Instances**: one.

See [Sentinel engine](./sentinel-engine.md) for how the harness runs a turn.

## Claude

Claude Code, driven through the Claude Agent SDK.

- **Needs**: the Claude Code CLI (`claude`).
- **Install**: Settings → Engines → Install runs `npm install -g @anthropic-ai/claude-code`. `claude update` updates native installs.
- **Sign in**: "Sign in with Claude" runs `claude auth login` in the embedded terminal. "Use an API key" stores `ANTHROPIC_API_KEY` for the instance.
- **Permission modes**: default, full. Full maps to Claude's `bypassPermissions`.
- **Plan mode**: native. Switching a thread between plan and chat starts a new Claude session, and Sentinel sends the thread's transcript with the first prompt.
- **Usage limits**: yes, from Claude Code's usage request and its live rate-limit events.
- **Skills**: `.claude/skills` in the workspace, and `skills` in the instance's home (`CLAUDE_CONFIG_DIR`, or `~/.claude`). A `$skill` chip is sent as Claude Code's `/name` command.
- **Slash commands**: the commands Claude Code lists when it starts.
- **Instance home**: `CLAUDE_CONFIG_DIR`.
- **Versions**: 2.1.280 or newer is supported. 2.1.111 to 2.1.280 works with a warning.

See [Claude Code](./claude-code.md).

## Codex

The Codex CLI, driven through its app server.

- **Needs**: the Codex CLI (`codex`).
- **Install**: `npm install -g @openai/codex`, the official script on macOS and Linux (`curl -fsSL https://chatgpt.com/codex/install.sh | sh`), or the PowerShell script on Windows (`irm https://chatgpt.com/codex/install.ps1 | iex`). `codex update` updates standalone installs.
- **Sign in**: "Sign in with ChatGPT" (browser), "Use a device code", or "Use an API key" (`OPENAI_API_KEY`).
- **Permission modes**: default, full. Default runs with the `on-request` approval policy and the `workspace-write` sandbox (`read-only` without a workspace). Full runs with `never` and `danger-full-access`.
- **Plan mode**: native.
- **Usage limits**: yes, from the app server's rate limits, updated live during runs.
- **Skills**: Codex's own skills, global only, in the instance's home.
- **Slash commands**: compact, review, rollback, and run.
- **Instance home**: `CODEX_HOME`.
- **Versions**: 0.156 or newer is supported and 0.160 or newer is recommended. 0.149 to 0.156 works, but plan mode uses a fallback and rollback may fail. Older versions show an "Unsupported version" warning.

See [Codex runtime](./codex-runtime.md).

## Copilot

GitHub Copilot, driven through the Copilot SDK.

- **Needs**: nothing. The Copilot runtime is bundled with Sentinel.
- **Install**: not needed. To run your own Copilot CLI instead, install it (`brew install copilot-cli` or `npm install -g @github/copilot`) and set it as the instance's binary path. Your own CLI needs version 1.0.0 or newer.
- **Sign in**: "Sign in with GitHub" runs `copilot login` in the embedded terminal. "Use a GitHub token" stores `COPILOT_GITHUB_TOKEN`. The runtime also reads `GH_TOKEN` and `GITHUB_TOKEN`; signing out leaves those in place.
- **Permission modes**: default, full.
- **Plan mode**: plan prompt.
- **Usage limits**: not reported.
- **Skills**: `.github/skills` in the workspace, and `skills` in the instance's home (`COPILOT_HOME`, or `~/.copilot`).
- **Instance home**: `COPILOT_HOME`.

## Cursor

Cursor Agent, over the Agent Client Protocol (ACP).

- **Needs**: the Cursor Agent CLI (`cursor-agent`, or `agent`).
- **Install**: `curl -fsS https://cursor.com/install | bash` on macOS and Linux. `agent update` updates it.
- **Sign in**: "Sign in with Cursor" runs `agent login` in the embedded terminal. "Use an API key" stores `CURSOR_API_KEY`.
- **Permission modes**: default, accept edits, full. Reads, searches, and thinking never ask. Web searches and fetches ask in default and accept edits. Accept edits only skips the question when every file an edit names is inside the workspace.
- **Plan mode**: Cursor's own plan mode. A chat turn switches it back.
- **Usage limits**: yes. On macOS without a token, Sentinel reads the Cursor login from the Keychain only after you confirm it in Settings → Engines.
- **Skills**: `.cursor/skills` in the workspace and in your home folder.
- **Slash commands**: the commands Cursor announces in a session.
- **Other**: image attachments and your MCP servers are passed to Cursor. One agent process runs per instance and thread, and ends after 10 idle minutes.
- **Versions**: 2026.5.9 or newer is supported.

## OpenCode

OpenCode 1.x or 2.x, through its local HTTP server.

- **Needs**: the OpenCode CLI (`opencode`).
- **Install**: `npm install -g opencode-ai` for 1.x, or `npm install -g @opencode/cli` for 2.x. Updates stay within the installed generation (`opencode upgrade <version>`), because moving from 1.x to 2.x converts OpenCode's database.
- **Sign in**: "Add a provider login" runs `opencode auth login` in the embedded terminal.
- **Permission modes**: default, accept edits, full.
- **Plan mode**: the turn runs with OpenCode's `plan` agent and file edits are denied, in every permission mode. The next chat turn goes back to the build agent.
- **Usage limits**: only for OpenCode Go, when an `opencode-go` login exists.
- **Skills**: `.opencode/skills` in the workspace and `~/.config/opencode/skills`.
- **Slash commands**: the server's commands, sent as `/name args`.
- **Other**: one `opencode serve` runs per instance and stops after 15 idle minutes. Threads continue their OpenCode session between turns.
- **Versions**: 1.0.224 or newer is required. 1.14.19 is recommended for 1.x, and 2.0.18 or newer for 2.x.

## Grok Build

xAI's Grok Build agent, over ACP. Experimental.

- **Needs**: the Grok CLI (`grok`).
- **Install**: `npm install -g @xai-official/grok`, or `curl -fsSL https://x.ai/cli/install.sh | bash`. `grok update` updates it.
- **Sign in**: "Sign in with Grok" runs `grok login` in the embedded terminal. "Use an xAI API key" stores `XAI_API_KEY`.
- **Permission modes**: default, auto, full. Grok has no accept-edits mode. Changing the mode restarts the agent.
- **Plan mode**: plan prompt. When Grok leaves plan mode, its plan shows as Sentinel's plan card.
- **Usage limits**: yes, the grok.com billing credits.
- **Skills**: the skills Grok reports through `grok inspect --json`.
- **Slash commands**: yes.
- **Instance home**: `GROK_HOME`.
- **Versions**: 1.0.13 or newer is required.

## Antigravity

Google Antigravity, through its ACP server. Experimental.

- **Needs**: nothing beforehand. Sentinel installs the Antigravity ACP server itself.
- **Install**: Settings → Engines → Install downloads the pinned release (about 110–330 MB depending on platform), checks its SHA-256, and starts it once to verify it. It only runs after you confirm.
- **Sign in**: "Sign in with Google" shows the sign-in link and also accepts a pasted redirect address, for signing in from another computer. The other methods are "Gemini Enterprise", "Use a Gemini API key" (`GEMINI_API_KEY`), and "Agent Platform API key" (`GOOGLE_API_KEY`, with a Google Cloud project and location).
- **Permission modes**: default, accept edits, full.
- **Plan mode**: not available.
- **Usage limits**: not reported.
- **Slash commands**: yes.
- **Instances**: each instance runs on its own private profile, so sign-ins never mix.
- **Versions**: 1.3.0 or newer.

## Pi

The Pi coding agent, over its JSON-lines RPC mode. Experimental.

- **Needs**: the Pi CLI (`pi`).
- **Install**: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, or `curl -fsSL https://pi.dev/install.sh | sh`. `pi update --self` updates it.
- **Sign in**: "Sign in from Pi" opens Pi in the embedded terminal, where you type `/login` and pick a provider. You can also store an Anthropic, OpenAI, Google Gemini, or OpenRouter API key for the instance. Pi keeps subscription logins in its own store (`~/.pi/agent`), shared by every Pi instance; sign out with `/logout` inside Pi.
- **Permission modes**: default, accept edits, full. Sentinel loads a small Pi extension that asks before every tool call. A turn in default or accept edits refuses to start if that extension cannot load, for example when the launch arguments turn extensions off.
- **Plan mode**: not available.
- **Usage limits**: not reported.
- **Skills and slash commands**: Pi's skills, prompt templates, and extension commands show in the slash menu after a full check. `/compact` runs Pi's own compaction.
- **Other**: no MCP servers. Launch arguments that pick Pi's mode or session (`--mode`, `--session`, `--resume`, `--print`, and similar) are rejected.
- **Versions**: 0.80.5 or newer is supported and 1.0.0 or newer is recommended.

## ACP Registry agents

Any agent listed in the [ACP Registry](https://agentclientprotocol.com/registry), or any command that speaks ACP. Experimental.

Examples include Devin, Gemini CLI, Mistral Vibe, and Goose.

- **Needs**: depends on the agent. Binary distributions need nothing. npx distributions need npm. uvx distributions need [uv](https://docs.astral.sh/uv/).
- **Install**: Settings → Engines → ACP Registry. "Add instance" in the ACP section opens the registry browser. Sentinel installs the agent into its own state folder, never globally. Archive formats Sentinel cannot unpack yet are shown as unavailable.
- **Custom command**: an ACP instance can point at a command and its arguments instead of a registry agent.
- **Sign in**: the methods the agent declares: its own sign-in, API keys stored as instance secrets, or a terminal command.
- **Permission modes**: default, accept edits, full.
- **Plan mode**: the agent's own plan mode when it has one, else the plan prompt.
- **Usage limits**: not reported.
- **Slash commands**: the commands the agent announces.
- **Instances**: there is no default instance. Each agent you add is an instance.

Sentinel adjusts for a few agents: Devin's sub-agent activity shows on the parent thread, Mistral Vibe's retries show as notices (a rate limit as a usage-limit notice), and Gemini CLI reads files itself, so Sentinel only serves files to it when the instance's `clientFs` setting is on.

Sentinel fetches the registry index when you open the browser and the cached copy is older than six hours, when you press Refresh, and at most once a day in the background when you have registry instances and update checks are on. Registry agents never start for background status checks.

## Related pages

- [Engines settings](../configuration/engines.md)
- [Engines, providers, and integrations](../reference/engines-providers-and-integrations.md)
- [Skills](../configuration/skills.md)

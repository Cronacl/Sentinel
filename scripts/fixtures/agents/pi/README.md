# Pi RPC mock

`mock-rpc.ts` stands in for `pi --mode rpc` from `@earendil-works/pi-coding-agent` 1.0.4. It speaks Pi's strict JSONL protocol on stdio: one JSON object per LF-terminated record, split only on LF (never on U+2028 or U+2029 inside strings), with a trailing CR stripped on input.

Command, response, event and extension UI shapes follow the package's `docs/rpc.md`, `docs/rpc-commands.md`, `docs/json.md`, `docs/rpc-extension-ui.md` and `dist/modes/rpc/rpc-types.d.ts`, and the subset t3code's `PiRpc.ts` / `PiAdapterV2.ts` consume.

It is a fixture, not a test, and app code must never import it.

```sh
SENTINEL_PI_MOCK_SCENARIO='{"prompts":[{"steps":[{"type":"text","text":["Hel","lo"]}]}]}' \
SENTINEL_PI_MOCK_LOG=/tmp/pi.jsonl \
bun scripts/fixtures/agents/pi/mock-rpc.ts
```

| Variable                         | Meaning                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `SENTINEL_PI_MOCK_SCENARIO`      | Scenario as inline JSON. Wins over the file variable.               |
| `SENTINEL_PI_MOCK_SCENARIO_FILE` | Path to a scenario JSON file.                                       |
| `SENTINEL_PI_MOCK_LOG`           | Append every received record to this JSONL file (`PiMockLogEntry`). |

The scenario type is `PiMockScenario` in [`scenario.ts`](./scenario.ts). [`test-driver.ts`](./test-driver.ts) is a minimal LF-framed client with id-correlated `request()`, an event list and `waitForEvent()`.

## Protocol summary

- Commands are `{id?, type, …}`. Responses are `{id, type:"response", command, success:true, data?}` or `{…, success:false, error}`. Malformed JSON gets `{type:"response", command:"parse", success:false, error:"Failed to parse command: …"}` without an id.
- `prompt` answers `{disposition:"started"}` before the run's events, `{disposition:"handled"}` (no run) or, while a run is active, needs `streamingBehavior` `"steer"` or `"followUp"` (`{disposition:"queued"}`); without it the command fails with Pi's "Agent is already processing…" error.
- Every other stdout record is an event or an `extension_ui_request`. `extension_ui_response` records on stdin answer dialogs by id and get no response.

## Commands

`prompt` (with `images` and `streamingBehavior`), `steer`, `follow_up`, `abort`, `clear_queue`, `new_session`, `get_state`, `get_messages`, `set_model`, `cycle_model`, `get_available_models`, `set_thinking_level`, `cycle_thinking_level`, `get_available_thinking_levels`, `set_steering_mode`, `set_follow_up_mode`, `compact`, `set_auto_compaction`, `set_auto_retry`, `abort_retry`, `bash`, `abort_bash`, `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_entries` (with `since`), `get_tree`, `get_last_assistant_text`, `set_session_name`, `get_commands`. Unknown types fail with `Unknown command: <type>`.

State the commands read and change:

```json
{
  "state": {
    "sessionId": "s1",
    "sessionFile": "/p/s1.jsonl",
    "sessionName": "Fix",
    "thinkingLevel": "medium",
    "model": "anthropic/claude-sonnet-4-20250514",
    "autoCompactionEnabled": true
  },
  "models": [
    {
      "id": "gpt-5.6",
      "name": "GPT-5.6",
      "api": "openai-responses",
      "provider": "openai",
      "reasoning": true,
      "thinkingLevelMap": { "xhigh": "xhigh" }
    }
  ],
  "thinkingLevels": ["off", "low", "high"],
  "commands": [
    {
      "name": "fix-tests",
      "source": "prompt",
      "sourceInfo": { "path": "/p/fix-tests.md" }
    }
  ],
  "messages": [],
  "entries": [],
  "sessions": {
    "/p/other.jsonl": { "sessionId": "other", "messages": [], "entries": [] }
  },
  "sessionStats": { "cost": 1.5 },
  "compaction": {
    "summary": "…",
    "firstKeptEntryId": "e1",
    "tokensBefore": 1000,
    "estimatedTokensAfter": 200
  },
  "bash": { "ls": { "output": "a.ts\n", "exitCode": 0 } },
  "cancelled": {
    "new_session": false,
    "switch_session": false,
    "fork": false,
    "clone": false
  }
}
```

- `sessionFile: null` behaves like `--no-session`. `model: null` starts without a model.
- Available thinking levels follow Pi's ladder (`off` … `max`) filtered by the model's `reasoning` flag and `thinkingLevelMap` (`xhigh` and `max` only when mapped), unless `thinkingLevels` is set.
- `switch_session {sessionPath}` loads `sessions[sessionPath]` (unknown paths fail). `fork {entryId}` keeps the entries before that user entry and returns its text. `cancelled` makes these operations report `{cancelled:true}` like an extension veto.
- `set_thinking_level` emits `thinking_level_changed`; `set_session_name` emits `session_info_changed`; `compact` emits `compaction_start` / `compaction_end` with `reason:"manual"`; `bash` emits `bash_execution_update` with the command id.

## Prompt scripts

```json
{
  "prompts": [
    { "match": "/review", "disposition": "handled" },
    { "match": "nope", "reject": "No API key for anthropic" },
    {
      "steps": [
        { "type": "thinking", "text": ["Let me ", "look."] },
        { "type": "text", "text": "Checking." },
        {
          "type": "toolCall",
          "name": "bash",
          "args": { "command": "ls" },
          "updates": [{ "content": [{ "type": "text", "text": "a" }] }],
          "result": {
            "content": [{ "type": "text", "text": "a.ts" }],
            "details": {}
          }
        },
        {
          "type": "ui",
          "method": "confirm",
          "fields": { "title": "Run rm?", "message": "rm -rf build" },
          "branches": { "confirmed": [], "declined": [], "cancelled": [] }
        },
        { "type": "text", "text": "Done." }
      ],
      "stopReason": "stop",
      "usage": {
        "input": 120,
        "output": 30,
        "cacheRead": 0,
        "cacheWrite": 0,
        "totalTokens": 150,
        "cost": {
          "input": 0,
          "output": 0,
          "cacheRead": 0,
          "cacheWrite": 0,
          "total": 0
        }
      }
    }
  ]
}
```

Script selection works like the ACP mock: `match` (substring of the message), then unmatched scripts in order, repeating the last. A run emits `agent_start`, `turn_start`, the user `message_start`/`message_end`, then the steps, the final assistant `message_end` (`stopReason` default `stop`, optional `errorMessage`), `turn_end`, `agent_end {messages, willRetry:false}` and `agent_settled`.

| Step                                                                                      | Events                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` / `thinking` (`text` string or array of deltas)                                    | `message_update` with `text_start`, `text_delta`…, `text_end {content}` (or `thinking_*`), each carrying the cumulative `usage`                                                                                                                                                                                                                                              |
| `toolCall {id?, name, args, updates?, durationMs?, result?, isError?}`                    | `toolcall_start/delta/end`, the assistant `message_end` (`stopReason:"toolUse"`), `tool_execution_start`, one `tool_execution_update` per `updates` entry, `tool_execution_end`, the `toolResult` message and `turn_end`; the next content opens a new turn                                                                                                                  |
| `ui {method, fields?, branches?}`                                                         | `extension_ui_request {id, method, …fields}`. Dialogs (`confirm`, `select`, `input`, `editor`) wait for the matching `extension_ui_response` and branch on `confirmed` / `declined` (confirm), the `value` (select, input, editor), `cancelled` or `timeout` (`fields.timeout` ms). `notify`, `setStatus`, `setWidget`, `setTitle` and `set_editor_text` are fire-and-forget |
| `compaction {reason?, result?, aborted?, willRetry?, errorMessage?, durationMs?}`         | `compaction_start` / `compaction_end`                                                                                                                                                                                                                                                                                                                                        |
| `retry {attempt?, maxAttempts?, delayMs?, errorMessage?, success?, finalError?, waitMs?}` | `auto_retry_start` / `auto_retry_end`                                                                                                                                                                                                                                                                                                                                        |
| `extensionError {extensionPath?, event?, error}`                                          | `extension_error`                                                                                                                                                                                                                                                                                                                                                            |
| `event {event}`                                                                           | any raw record                                                                                                                                                                                                                                                                                                                                                               |
| `delay {ms}`, `hang`                                                                      | wait (abortable); `hang` never ends on its own                                                                                                                                                                                                                                                                                                                               |
| `stdout {lines}`, `stderr {text, repeat?}`, `exit {code?, signal?}`                       | noise and crashes                                                                                                                                                                                                                                                                                                                                                            |

Steering and follow-ups: `prompt` with `streamingBehavior`, `steer` and `follow_up` during a run emit `queue_update`. Steering messages are delivered at the next tool boundary (the current script stops there), follow-ups after the script ends; each runs its own selected script within the same `agent_start` … `agent_settled` run. `abort` ends the run with an `aborted` assistant message (`abortErrorMessage`), then `agent_end` and `agent_settled`, before the abort response.

## Faults

```json
{
  "commandErrors": { "set_model": "Model not found" },
  "commandDelays": { "get_available_models": 2000 },
  "hangCommands": ["get_state"],
  "faults": {
    "startupStdout": ["not json"],
    "startupStderr": "…",
    "stderrFloodBytes": 65536,
    "crlf": true,
    "splitFramesBytes": 5,
    "exitAfterMs": 100,
    "exitCode": 1,
    "exitOnStdinClose": true
  }
}
```

`crlf` ends every record with CRLF and `splitFramesBytes` writes records in small chunks, so clients prove their framing. Closing stdin aborts any run and exits 0 unless `exitOnStdinClose` is false.

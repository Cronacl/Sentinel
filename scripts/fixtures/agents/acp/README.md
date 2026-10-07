# ACP mock agent

`mock-agent.ts` is a scriptable [Agent Client Protocol](https://agentclientprotocol.com) agent for protocol tests. It is a real `@agentclientprotocol/sdk` 1.7 `agent()` app connected with `ndJsonStream` over its own stdin and stdout, so the bytes on the pipe are what a real ACP agent writes: one JSON-RPC 2.0 message per LF-terminated line.

It is a fixture, not a test. The test runner only collects `*.test.*` files, and app code must never import it (tripwire `fixtures-in-app-code`).

```sh
SENTINEL_ACP_MOCK_SCENARIO='{"prompts":[{"steps":[{"type":"text","text":"hi"}]}]}' \
SENTINEL_ACP_MOCK_LOG=/tmp/acp.jsonl \
bun scripts/fixtures/agents/acp/mock-agent.ts
```

| Variable                          | Meaning                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `SENTINEL_ACP_MOCK_SCENARIO`      | Scenario as inline JSON. Wins over the file variable.             |
| `SENTINEL_ACP_MOCK_SCENARIO_FILE` | Path to a scenario JSON file.                                     |
| `SENTINEL_ACP_MOCK_LOG`           | Append every received frame to this JSONL file (see [Log](#log)). |

No scenario means SDK defaults: protocol version 1, a mock `agentInfo`, every session capability, and one text chunk per prompt. A malformed scenario exits with code 2 and a message on stderr.

The scenario type is `AcpMockScenario` in [`scenario.ts`](./scenario.ts); every field below is optional and the sections compose.

## Drive it from a test

[`test-harness.ts`](./test-harness.ts) spawns the mock and connects the SDK's `client()` builder through a byte-level `ndJsonStream` on the child's stdio, never the in-memory app pair (which would skip the framing these fixtures exist to exercise; design critique G10).

```ts
// From src/lib/ai/chat/engines/acp/<name>.test.ts:
import { startAcpHarness } from "../../../../../../scripts/fixtures/agents/acp/test-harness";

const harness = startAcpHarness(scenario, {
  requestPermission: () => ({
    outcome: { outcome: "selected", optionId: "allow-once" },
  }),
  extRequests: { "cursor/ask_question": () => ({ answers: {} }) },
  extNotifications: ["x.ai/session/prompt_complete"],
});
await harness.initialize();
const { sessionId } = await harness.newSession();
await harness.prompt(sessionId, "go");
await harness.settle(); // notifications can trail the prompt response
harness.updates; // every session/update the client SDK delivered
harness.calls; // every agent→client request and notification handled
harness.log(); // every frame the mock received
await harness.dispose();
```

[`profiles.ts`](./profiles.ts) has starting scenarios that reproduce the recorded wire traits of Cursor, Grok Build, Antigravity and Devin.

## `initialize`

```json
{
  "initialize": {
    "protocolVersion": 1,
    "agentInfo": { "name": "grok", "version": "1.0.50" },
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true,
        "audio": false,
        "embeddedContext": true
      },
      "mcpCapabilities": { "http": true, "sse": false },
      "sessionCapabilities": {
        "list": {},
        "resume": {},
        "fork": {},
        "close": {},
        "delete": {}
      },
      "auth": { "logout": {} }
    },
    "authMethods": [
      { "id": "cursor_login", "name": "Cursor login" },
      {
        "id": "tty",
        "name": "Terminal login",
        "type": "terminal",
        "args": ["login"],
        "env": { "MODE": "tty" }
      },
      {
        "id": "api-key",
        "name": "API key",
        "type": "env_var",
        "vars": [{ "name": "XAI_API_KEY" }],
        "link": "https://…"
      }
    ],
    "meta": { "vendor": "x" },
    "echoMeta": true
  }
}
```

- `protocolVersion` defaults to the SDK's `PROTOCOL_VERSION` (1). Antigravity answers 2 with a v1-shaped body.
- `agentInfo` defaults to `sentinel-acp-mock`; `null` sends `agentInfo: null`.
- `agentCapabilities` replaces the defaults as a whole (`DEFAULT_AGENT_CAPABILITIES`).
- `authMethods` are passed through untouched. The stable 1.7 schema knows `agent` (untyped or `type:"agent"`) and `terminal`; `env_var` (`vars`, `link`) is the registry shape agents still send.
- `meta` becomes the response `_meta`. `echoMeta` adds the client's raw `protocolVersion`, `clientInfo`, `clientCapabilities` and `_meta` under `_meta["sentinel.mock/request"]`, before the SDK strips unknown keys.
- `response` answers with exactly that object instead (any legacy shape).

## Auth

```json
{
  "auth": {
    "requireAuth": true,
    "acceptMethodIds": ["cursor_login"],
    "delayMs": 0
  }
}
```

With `requireAuth`, `session/new|load|resume|fork` fail with the ACP auth-required error (`-32000`, `RequestError.authRequired`, optional `message` and `errorData`) until `authenticate` succeeds. `authenticate` with an id outside `acceptMethodIds` fails with `rejectError` (default `-32602`). `logout` drops the auth again. `delayMs` delays the `authenticate` response (browser login stand-in).

## Sessions

```json
{
  "session": {
    "ids": ["first", "second"],
    "modes": {
      "currentModeId": "agent",
      "availableModes": [
        { "id": "agent", "name": "Agent" },
        { "id": "plan", "name": "Plan" }
      ]
    },
    "configOptions": [
      {
        "type": "select",
        "id": "model",
        "name": "Model",
        "category": "model",
        "currentValue": "fast",
        "options": [{ "value": "fast", "name": "fast" }]
      },
      {
        "type": "select",
        "id": "effort",
        "name": "Effort",
        "category": "thought_level",
        "currentValue": "medium",
        "options": []
      },
      {
        "type": "select",
        "id": "mode",
        "name": "Mode",
        "category": "mode",
        "currentValue": "agent",
        "options": []
      }
    ],
    "models": {
      "currentModelId": "grok-build",
      "availableModels": [{ "modelId": "grok-build", "name": "Grok Build" }]
    },
    "afterNew": [
      { "sessionUpdate": "available_commands_update", "availableCommands": [] }
    ],
    "load": {
      "replay": [
        {
          "sessionUpdate": "user_message_chunk",
          "content": { "type": "text", "text": "earlier" }
        }
      ],
      "knownSessionIds": ["persisted"]
    },
    "resume": { "knownSessionIds": ["persisted"] },
    "emitCurrentModeUpdate": true,
    "emitConfigOptionUpdate": true,
    "configOptionsAfterSet": { "model=gpt-5.4": [] }
  }
}
```

- `session/new` and `session/fork` hand out `ids` in order, then `mock-session-<n>`. Responses carry `modes`, `configOptions`, the legacy unstable `models` state and `meta` (as `_meta`).
- `afterNew` updates are sent right after the `session/new` response.
- `session/load` replays `load.replay` through `session/update` **before** it responds (`replayDelayMs` between updates). `knownSessionIds` makes other ids fail with `unknownSessionError` (default `-32002`); `error` fails every load. `resume` works the same without a replay.
- `session/list` returns `list` or the sessions this process created; `session/close` cancels a running turn; `session/delete` forgets the session.
- `session/set_mode` validates the mode id; `session/set_config_option` validates select values (grouped options are flattened) and returns the new options. `configOptionsAfterSet["<configId>=<value>"]` replaces the whole list (Cursor's per-model effort list). The `emit*` flags send the matching update after the response.
- `session/set_model` (unstable, not in the 1.7 method tables) is registered as an extension method and validates against `models`.

Strings in replay and `afterNew` updates can use `{{sessionId}}` and `{{cwd}}`.

## Prompt scripts

```json
{
  "prompts": [
    {
      "match": "plan",
      "steps": [
        { "type": "extRequest", "method": "cursor/create_plan", "params": {} }
      ]
    },
    {
      "steps": [{ "type": "text", "text": "first turn" }],
      "stopReason": "end_turn"
    },
    {
      "steps": [{ "type": "text", "text": "later turns" }],
      "stopReason": "max_tokens",
      "usage": { "totalTokens": 30, "inputTokens": 20, "outputTokens": 10 }
    }
  ]
}
```

A prompt whose text contains a script's `match` runs that script. Other prompts take the unmatched scripts in order, repeating the last one. A script ends with `stopReason` (default `end_turn`; `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`; `null` answers `{}` without one), optional `usage` and `meta` (`_meta`), or fails with `error` after its steps.

Strings in steps can use `{{sessionId}}`, `{{cwd}}`, `{{promptText}}`, `{{promptId}}` (`_meta.promptId` or `_meta.requestId` of the prompt) and `{{promptMeta}}`. A string that is exactly one placeholder takes the raw value.

### Steps

Every step except the control steps can carry `meta`, which becomes `_meta` on the update or request.

| Step                                                                                                                                                                                                                      | Wire effect                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{"type":"text","text":"…","messageId?":"m1"}`                                                                                                                                                                            | `agent_message_chunk` with text content                                                                                                                                                                                                                                                                  |
| `{"type":"thought","text":"…"}`                                                                                                                                                                                           | `agent_thought_chunk`                                                                                                                                                                                                                                                                                    |
| `{"type":"image","data":"<base64>","mimeType":"image/png","uri?":"…"}`                                                                                                                                                    | `agent_message_chunk` with image content                                                                                                                                                                                                                                                                 |
| `{"type":"toolCall","toolCallId":"c1","title":"Edit a.ts","kind":"edit","status":"pending","rawInput":{},"locations":[{"path":"/a.ts","line":3}],"content":[{"type":"diff","path":"/a.ts","oldText":"a","newText":"b"}]}` | `tool_call`; `kind` is `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode` or `other`                                                                                                                                                                                 |
| `{"type":"toolCallUpdate","toolCallId":"c1","title":"Edited"}`                                                                                                                                                            | `tool_call_update` with **only** the fields given, so updates can omit `status`                                                                                                                                                                                                                          |
| `{"type":"plan","entries":[{"content":"Read","priority":"high","status":"completed"}]}`                                                                                                                                   | `plan`                                                                                                                                                                                                                                                                                                   |
| `{"type":"update","update":{…},"sessionId?":"other"}`                                                                                                                                                                     | any raw `session/update` payload, including `available_commands_update`, `current_mode_update`, `config_option_update`, `usage_update`, `session_info_update`, `plan_update`, `notice` and kinds outside the 1.7 union (Grok `subagent_finished`); `sessionId` targets another session (Devin subagents) |
| `{"type":"requestPermission","toolCall":{…},"options?":[…],"branches":{"allow-once":[…],"cancelled":[…],"*":[…]}}`                                                                                                        | `session/request_permission`, then the branch keyed by the selected `optionId` (or `cancelled`). Default options: `allow-once`, `allow-always`, `reject-once`, `reject-always` (one per kind); add custom ids freely                                                                                     |
| `{"type":"extRequest","method":"x.ai/ask_user_question","params":{},"branches":{"accepted":[…],"error":[…]},"echo":true}`                                                                                                 | a vendor request; branch on `result.outcome`, else `ok`, or `error` when the client fails it (unregistered methods get `-32601`). `echo` writes the result as a text chunk                                                                                                                               |
| `{"type":"extNotification","method":"x.ai/session/prompt_complete","params":{}}`                                                                                                                                          | a vendor notification (`cursor/update_todos`, `_session/retrying`, …)                                                                                                                                                                                                                                    |
| `{"type":"clientFs","op":"read","path":"/a.md","line":2,"limit":1,"echo":true}`                                                                                                                                           | `fs/read_text_file`; `echo` reports the result or error                                                                                                                                                                                                                                                  |
| `{"type":"clientFs","op":"write","path":"/a.md","content":"…"}`                                                                                                                                                           | `fs/write_text_file`                                                                                                                                                                                                                                                                                     |
| `{"type":"clientTerminal","command":"npm","args":["test"],"env":[{"name":"CI","value":"1"}],"cwd":"{{cwd}}","outputByteLimit":1024,"toolCallId":"c2","kill":false,"noWait":false,"release":true,"echo":true}`             | `terminal/create`, an optional `tool_call_update` with terminal content, optional `terminal/kill`, `terminal/wait_for_exit`, `terminal/output`, `terminal/release`                                                                                                                                       |
| `{"type":"elicitation","mode":"form","message":"…","requestedSchema":{…},"branches":{"accept":[…],"decline":[…]}}`                                                                                                        | `elicitation/create` (form); branch on the response `action`                                                                                                                                                                                                                                             |
| `{"type":"elicitation","mode":"url","message":"Sign in","url":"https://…","elicitationId":"e1","complete":true}`                                                                                                          | `elicitation/create` (url), then `elicitation/complete` when `complete`                                                                                                                                                                                                                                  |
| `{"type":"delay","ms":500}`                                                                                                                                                                                               | waits; a cancel interrupts it                                                                                                                                                                                                                                                                            |
| `{"type":"stdout","lines":["not json"]}`                                                                                                                                                                                  | raw lines on stdout between frames                                                                                                                                                                                                                                                                       |
| `{"type":"stderr","text":"…","repeat":1000}`                                                                                                                                                                              | stderr text                                                                                                                                                                                                                                                                                              |
| `{"type":"exit","code":3,"stderr":"panic"}` / `{"type":"exit","signal":"SIGKILL"}`                                                                                                                                        | crash mid-turn (stdout is flushed first)                                                                                                                                                                                                                                                                 |
| `{"type":"hang","ignoreCancel":false}`                                                                                                                                                                                    | never answer; `session/cancel` still ends the turn unless `ignoreCancel`                                                                                                                                                                                                                                 |
| `{"type":"waitForCancel"}`                                                                                                                                                                                                | block until `session/cancel`                                                                                                                                                                                                                                                                             |
| `{"type":"stop","stopReason":"refusal"}`                                                                                                                                                                                  | end the turn now                                                                                                                                                                                                                                                                                         |
| `{"type":"fail","error":{"code":-32003,"message":"Rate limited","data":{}}}`                                                                                                                                              | fail the prompt request now                                                                                                                                                                                                                                                                              |

Branches are step lists keyed by outcome, with `"*"` as the fallback; a branch can itself end the turn with `stop`.

## Cancel

`session/cancel` is a notification. It aborts the turn that was running when it arrived (a cancel that raced ahead of the prompt handler still counts) and never leaks into the next prompt. The prompt then answers `stopReason: "cancelled"`.

```json
{
  "cancel": {
    "stopReason": "end_turn",
    "updates": [
      {
        "sessionUpdate": "tool_call_update",
        "toolCallId": "c1",
        "status": "failed"
      }
    ],
    "exitCode": 1
  }
}
```

`stopReason` overrides the answer (`end_turn` reproduces the cancel/complete race), `updates` are sent after the cancel arrived and before the response, and `exitCode` exits instead of answering.

## Faults

```json
{
  "faults": {
    "startupStdout": [
      "Open the following link to authenticate the ACP server: https://accounts.google.com/o/oauth2/v2/auth?…"
    ],
    "startupStderr": "warming up",
    "stderrFloodBytes": 262144,
    "splitFramesBytes": 7,
    "exitAfterMs": 50,
    "exitCode": 7,
    "exitOnStdinClose": true,
    "hangMethods": ["session/new"],
    "methodDelays": { "initialize": 3000 },
    "methodErrors": { "session/list": { "code": -32603, "message": "boom" } }
  }
}
```

Non-JSON stdout lines exercise the client's stdout filter. Without one, the SDK's `ndJsonStream` answers each bad line by writing a `-32700` parse-error response back to the agent; the mock logs those, so tests can prove it. `splitFramesBytes` writes every frame in small chunks. The process exits 0 when stdin closes unless `exitOnStdinClose` is false.

## Log

Each line of `SENTINEL_ACP_MOCK_LOG` is one `AcpMockLogEntry`, recorded from the raw frame before the SDK parses it (so unknown keys survive):

```json
{"ts":1759840000000,"kind":"request","id":2,"method":"session/prompt","params":{"sessionId":"mock-session-1","prompt":[…],"_meta":{"promptId":"p1"}}}
{"ts":1759840000001,"kind":"notification","method":"session/cancel","params":{"sessionId":"mock-session-1"}}
{"ts":1759840000002,"kind":"response","id":0,"result":{"outcome":{"outcome":"selected","optionId":"allow-once"}}}
{"ts":1759840000003,"kind":"lifecycle","event":"exit-step","detail":{"code":3}}
```

`response` entries are the client's answers to the mock's own requests (and the SDK's parse-error frames).

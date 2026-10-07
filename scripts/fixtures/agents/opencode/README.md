# Fake OpenCode server

`fake-server.ts` fakes the OpenCode HTTP API on `Bun.serve` for both server generations. Steps in a scenario are generation-neutral; the fake renders them in the generation's wire shape.

| Generation | Clients                                                   | Routes                                                                                                                                                                                                                                                                                                                                                                                                                                | Events                                                                                                                                                     |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (1.x)    | `@opencode-ai/sdk/v2` (what Sentinel's engine uses today) | `GET /global/health`, `/provider`, `/agent`, `/command`, `/session`, `/permission`, `/question`; `POST /session`; `GET\|DELETE /session/{id}`; `GET /session/{id}/message`; `POST /session/{id}/prompt_async` (204), `/message` (sync), `/abort`; `POST /permission/{id}/reply`; `POST /question/{id}/reply\|reject`                                                                                                                  | SSE `GET /event`: `{type, properties}` frames                                                                                                              |
| 2 (2.x)    | `@opencode/client` 2.0.24 routes (not a dependency here)  | `GET /api/info`, `/api/model`, `/api/provider`, `/api/agent`, `/api/command`, `/api/session`; `POST /api/session`; `GET\|DELETE /api/session/{id}`; `GET /api/session/{id}/message`, `/permission`, `/inbox`; `POST /api/session/{id}/prompt`, `/interrupt`, `/model`, `/agent`, `/permission/{reqId}/reply`; `DELETE /api/session/{id}/inbox/{inboxId}`; `GET\|DELETE /api/session/{id}/form/{formId}`, `POST …/form/{formId}/reply` | SSE `GET /api/event`: `{id, created, type, durable?, location, data}` envelopes with a per-session `durable.seq` on durable events, `: heartbeat` comments |

Unknown `GET` paths answer with the web UI's HTML on both generations, like the real servers (so `/global/health` proves nothing on 2.x and `/api/info` nothing on 1.x). Shapes were checked against the installed `@opencode-ai/sdk` 1.14 `dist/v2/gen/types.gen.d.ts`, `@opencode/client` 2.0.24 (`npm pack`, generated Promise client and `types.d.ts`) and t3code's `opencode2` provider.

It is a fixture, not a test, and app code must never import it.

## Programmatic use

```ts
// From src/lib/ai/chat/engines/opencode-sdk/<name>.test.ts:
import { start } from "../../../../../../scripts/fixtures/agents/opencode/fake-server";

const fake = await start({ generation: 2, scenario, password: "pw" });
fake.url; // http://127.0.0.1:<port>
fake.password; // 2.x always has one (generated when omitted); 1.x only when given
fake.requests; // every request: {method, path, query, headers, body}
fake.emit({ id: "evt_x", type: "session.status", data: { … } }); // raw event to every subscriber
await fake.stop(); // closes the server and every SSE stream
```

Auth is HTTP Basic with user `opencode` (`openCodeBasicAuth(password)` in [`scenario.ts`](./scenario.ts)). A wrong or missing header gets 401: an empty body on 1.x, `{"_tag":"UnauthorizedError",…}` with `www-authenticate: Basic` on 2.x.

## As a stand-in binary

```sh
SENTINEL_OPENCODE_FAKE_GENERATION=2 bun scripts/fixtures/agents/opencode/fake-server.ts serve --hostname=127.0.0.1 --port=0
```

| Variable                               | Meaning                                             |
| -------------------------------------- | --------------------------------------------------- |
| `SENTINEL_OPENCODE_FAKE_GENERATION`    | `1` (default) or `2`                                |
| `SENTINEL_OPENCODE_FAKE_SCENARIO`      | Scenario as inline JSON                             |
| `SENTINEL_OPENCODE_FAKE_SCENARIO_FILE` | Path to a scenario JSON file                        |
| `SENTINEL_OPENCODE_FAKE_LOG`           | Append every request to this JSONL file             |
| `OPENCODE_SERVER_PASSWORD` (1.x)       | Basic-auth password; unset serves without auth      |
| `OPENCODE_PASSWORD` (2.x)              | Basic-auth password; unset generates and prints one |

Readiness output matches `opencode serve`: 1.x prints `opencode server listening on http://…`; 2.x prints `server listening on http://…`, then `server password <pw>` when it generated the password. `--version` prints `1.18.32` (1.x) or `opencode v2.0.18` (2.x), or the scenario's `version`. SIGTERM and SIGINT stop it. [`test-harness.ts`](./test-harness.ts) has `spawnFakeOpenCode()` (spawn and parse readiness) and `readSse()` (a minimal `text/event-stream` reader).

## Scenario

The type is `OpenCodeFakeScenario` in [`scenario.ts`](./scenario.ts).

```json
{
  "version": "1.3.17",
  "directory": "/work/repo",
  "providers": null,
  "models": null,
  "agents": null,
  "commands": null,
  "sessions": [{ "id": "ses_existing", "title": "Earlier" }],
  "heartbeatMs": 50,
  "abortEmitsSessionError": true,
  "prompts": [
    {
      "match": "fail",
      "steps": [
        { "type": "error", "message": "Provider exploded", "name": "APIError" }
      ]
    },
    {
      "match": "nope",
      "reject": { "status": 400, "body": { "name": "BadRequest" } }
    },
    {
      "steps": [
        { "type": "reasoning", "text": ["Let me ", "think."] },
        {
          "type": "tool",
          "tool": "bash",
          "callID": "call_1",
          "input": { "command": "ls" },
          "output": "a.ts\n",
          "metadata": { "exit": 0 },
          "permission": { "permission": "bash", "patterns": ["ls"] }
        },
        { "type": "text", "text": ["Hello ", "there"] }
      ],
      "finish": "stop",
      "tokens": { "input": 10, "output": 4 },
      "cost": 0.002
    }
  ]
}
```

- `version` defaults to `1.18.32` / `2.0.18`. `providers`, `models`, `agents` and `commands` replace the default bodies (raw, in the generation's shape).
- `heartbeatMs`: 1.x sends a `server.heartbeat` event (default 10 s), 2.x a `: heartbeat` comment (default 15 s). The first frame is always `server.connected`.
- Prompt scripts are selected like the other fixtures: `match` (substring of the prompt text), then unmatched scripts in order, repeating the last. `reject` answers the prompt request with that status and body instead of running.

### Steps

| Step                                                                                        | 1.x events                                                                                                                             | 2.x events                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` / `reasoning` (`text` string or array of deltas)                                     | `message.part.updated` (empty part), `message.part.delta` per delta, `message.part.updated` with the full text and `time.end`          | `session.text.started`, `.delta`…, `.ended` (or `session.reasoning.*`), keyed by the content `ordinal`                                         |
| `tool {tool, callID?, input, output?, title?, metadata?, error?, durationMs?, permission?}` | tool part `pending` → `running` → `completed` / `error`                                                                                | `session.tool.input.started/delta/ended`, `session.tool.called`, `session.tool.progress` (when `metadata`), `session.tool.success` / `.failed` |
| `permission {permission, patterns?, metadata?, message?, branches?}`                        | `permission.asked` (`permission`, `patterns`, `always`, `tool?`), wait for `POST /permission/{id}/reply {reply}`, `permission.replied` | `permission.asked` (`action`, `resources`, `save`, `source?`), wait for `POST …/permission/{id}/reply {decision}`, `permission.replied`        |
| `question {questions, branches?}` (1.x only)                                                | `question.asked`, then `question.replied {answers}` or `question.rejected`; branches `replied` / `rejected`                            | —                                                                                                                                              |
| `form {title, fields, metadata?, branches?}` (2.x only)                                     | —                                                                                                                                      | `form.created {form}`, then `form.replied {answer}` or `form.cancelled`; branches `replied` / `cancelled`                                      |
| `event {event}`                                                                             | any raw event in the generation's shape                                                                                                | same                                                                                                                                           |
| `delay {ms}`, `hang`                                                                        | wait (abortable); `hang` never ends on its own                                                                                         | same                                                                                                                                           |
| `error {message, name?}`                                                                    | assistant `error` and `session.error`                                                                                                  | `session.step.failed` and `session.execution.failed`                                                                                           |

A tool's `permission` asks before the tool runs; a `reject` reply fails the tool. Permission branches are keyed by the reply (`once`, `always`, `reject`), with `"*"` as the fallback.

### Run lifecycle

- **1.x.** `message.updated` (user), its parts, `session.status busy`, `message.updated` (assistant), a `step-start` part, the steps, a `step-finish` part (`reason`, `cost`, `tokens`), the completed assistant `message.updated`, `session.status idle`, `session.idle`. `POST /session/{id}/abort` ends a run with `MessageAbortedError` (and `session.error` unless `abortEmitsSessionError` is false). Prompts sent while a run is busy queue behind it.
- **2.x.** `POST /prompt` answers with the inbox item (`SessionInboxUser`) and publishes `session.inbox.enqueued`. Each execution publishes `session.execution.started`, `session.inbox.delivered`, `session.status busy`, `session.step.started`, the steps, `session.step.ended`, `session.execution.succeeded` (or `.interrupted {reason:"user"}` after `POST /interrupt`, or `.failed`), `session.status idle`, `session.idle`. `delivery:"queue"` prompts run as later executions; `delivery:"steer"` prompts sent during an execution are delivered at its next step boundary (the step ends, the steer's user message joins the conversation and a new step runs the steer's script). `resume:false` leaves the prompt in the inbox. `DELETE /api/session/{id}/inbox/{inboxId}` cancels an undelivered prompt (`session.inbox.cancelled`). `GET /message` returns the conversation as `SessionMessageInfo` items.

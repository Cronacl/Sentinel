# Agent protocol fixtures

Scriptable fakes of the agent wire protocols Sentinel's engines speak. Tests spawn them as child processes (or start the OpenCode fake in process) and drive them with the real client side, so framing, ordering and error paths are exercised byte for byte without a real agent or model.

| Fixture                                           | Protocol                                                                       | Real counterpart                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`acp/mock-agent.ts`](./acp/README.md)            | ACP: JSON-RPC 2.0 over stdio NDJSON (`@agentclientprotocol/sdk` 1.7 `agent()`) | Cursor `agent acp`, Grok `grok agent stdio`, Antigravity `agy_acp_server`, ACP Registry agents (Devin, Mistral Vibe, …) |
| [`pi/mock-rpc.ts`](./pi/README.md)                | Pi RPC: LF-delimited JSONL over stdio                                          | `pi --mode rpc` (`@earendil-works/pi-coding-agent` 1.0.4)                                                               |
| [`opencode/fake-server.ts`](./opencode/README.md) | HTTP + SSE                                                                     | `opencode serve` 1.x and 2.x                                                                                            |

Conventions:

- Fixtures and their helpers (`scenario.ts`, `test-harness.ts`, `test-driver.ts`, `profiles.ts`, `shared/`) are not `*.test.*` files, so `scripts/run-tests.mjs` never runs them as tests. Their self-tests (`*.test.ts` next to them) run in the normal suite.
- Each fixture reads a JSON scenario from an inline variable (`SENTINEL_ACP_MOCK_SCENARIO`, `SENTINEL_PI_MOCK_SCENARIO`, `SENTINEL_OPENCODE_FAKE_SCENARIO`) or the matching `…_SCENARIO_FILE`, and appends what it received to the JSONL file named by the matching `…_LOG`. The scenario types live in each `scenario.ts`.
- App code never references `scripts/fixtures/` (tripwire `fixtures-in-app-code`); engine tests and helpers under `__fixtures__/` or `__tests__/` may.
- Nothing here talks to a real agent, model or network service. Fault injection (stdout noise, stderr floods, split frames, crashes, hangs, slow methods) is part of every fixture.

import { describe, expect, it } from "bun:test";

import { createDevinNormalizer, getAcpRegistryOverlay } from "./overlays";

const update = (sessionId: string, body: Record<string, unknown>) =>
  ({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: body },
  }) as never;

describe("Devin normalizer", () => {
  it("routes a nested subagent's update to its parent and keeps root updates", () => {
    const normalize = createDevinNormalizer();
    const nested = normalize(
      update("sub-2", {
        _meta: { "cognition.ai/subagent_context": { parentAgentId: "sub-1" } },
        content: { text: "hi", type: "text" },
        sessionUpdate: "agent_message_chunk",
      }),
    ) as { params: { sessionId: string; update: Record<string, unknown> } };
    expect(nested.params.sessionId).toBe("sub-1");
    expect(nested.params.update).toMatchObject({
      senderSessionId: "sub-2",
      sessionUpdate: "session_message_chunk",
    });

    const own = update("root-session", {
      _meta: { "cognition.ai/streamingMessageId": "m-1" },
      content: { text: "hi", type: "text" },
      sessionUpdate: "agent_message_chunk",
    });
    expect(
      (normalize(own) as { params: { update: { messageId: string } } }).params
        .update.messageId,
    ).toBe("m-1");
  });

  it("drops subagent thoughts and names untitled tools", () => {
    const normalize = createDevinNormalizer();
    expect(
      normalize(
        update("sub-1", {
          _meta: { "cognition.ai/subagent_context": { parentAgentId: "root" } },
          content: { text: "thinking", type: "text" },
          sessionUpdate: "agent_thought_chunk",
        }),
      ),
    ).toBeNull();
    const tool = normalize(
      update("s", {
        _meta: { "cognition.ai/inferenceToolName": "grep" },
        sessionUpdate: "tool_call",
        title: "Tool",
        toolCallId: "t1",
      }),
    ) as { params: { update: { title: string } } };
    expect(tool.params.update.title).toBe("grep");
  });

  it("leaves requests and responses alone", () => {
    const normalize = createDevinNormalizer();
    const request = {
      id: 1,
      jsonrpc: "2.0",
      method: "session/update",
      params: {},
    } as never;
    expect(normalize(request)).toBe(request);
  });
});

describe("getAcpRegistryOverlay", () => {
  it("has overlays for Devin, Mistral Vibe and Gemini only", () => {
    expect(getAcpRegistryOverlay("devin").clientTerminals).toBe(true);
    expect(
      Object.keys(getAcpRegistryOverlay("mistral-vibe").extNotifications ?? {}),
    ).toEqual(["_session/retrying"]);
    expect(getAcpRegistryOverlay("gemini")).toEqual({ clientFs: false });
    expect(getAcpRegistryOverlay("goose")).toEqual({});
  });
});

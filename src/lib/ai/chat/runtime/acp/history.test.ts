import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { planAcpHistory } from "./history";

const message = (id: string, role: "assistant" | "user"): ThreadUIMessage => ({
  id,
  metadata: {},
  parts: [{ text: id, type: "text" }],
  role,
});

// u1 → a1 (this agent), u2 → a2 (another engine), u3 (this turn).
const transcript = [
  message("u1", "user"),
  message("a1", "assistant"),
  message("u2", "user"),
  message("a2", "assistant"),
  message("u3", "user"),
];

const plan = (
  state: Parameters<typeof planAcpHistory>[0]["state"],
  messages = transcript,
) => planAcpHistory({ currentMessageId: "u3", state, transcript: messages });

describe("planAcpHistory", () => {
  it("sends everything without a session, or to one that never got it", () => {
    expect(plan(null)).toEqual({ type: "full" });
    expect(plan({ historyDelivered: false, sessionId: "s" })).toEqual({
      type: "full",
    });
  });

  it("sends nothing when the session ran the latest turn", () => {
    expect(
      plan({ historyDelivered: true, sessionId: "s", syncedMessageId: "a2" }),
    ).toEqual({ type: "none" });
  });

  it("sends the turns another engine answered since the session's last one", () => {
    const result = plan({
      historyDelivered: true,
      sessionId: "s",
      syncedMessageId: "a1",
    });
    expect(result.type).toBe("since");
    expect(
      result.type === "since" ? result.messages.map((entry) => entry.id) : [],
    ).toEqual(["u2", "a2"]);
  });

  it("needs a new session when the thread no longer has the session's last turn", () => {
    // u2 was edited into u2b: a2 is gone from the active branch.
    expect(
      plan({ historyDelivered: true, sessionId: "s", syncedMessageId: "a2" }, [
        message("u1", "user"),
        message("a1", "assistant"),
        message("u3", "user"),
      ]),
    ).toEqual({ type: "diverged" });
  });

  it("trusts state from before the mark existed (the old runtime always sent everything)", () => {
    expect(plan({ sessionId: "s" })).toEqual({ type: "none" });
    expect(plan({ historyDelivered: true, sessionId: "s" })).toEqual({
      type: "none",
    });
  });
});

import { describe, expect, it } from "bun:test";

import {
  getApprovalButtons,
  getExternalToolContent,
  getExternalToolMeta,
} from "./external-tool-meta";

describe("external tool metadata", () => {
  it("reads the sentinel metadata and falls back to the part title", () => {
    const part = {
      callProviderMetadata: {
        sentinel: {
          agentLabel: "Cursor",
          kind: "edit",
          locations: [{ line: 2, path: "/w/a.ts" }, { nope: true }],
          preview: { diffs: [{ newText: "b", oldText: "a", path: "/w/a.ts" }] },
        },
      },
      input: {},
      state: "input-available",
      title: "Edit a.ts",
      toolCallId: "t",
      toolName: "cursor_edit",
      type: "dynamic-tool",
    } as any;
    const meta = getExternalToolMeta(part)!;
    expect(meta).toEqual(
      expect.objectContaining({
        agentLabel: "Cursor",
        kind: "edit",
        locations: [{ line: 2, path: "/w/a.ts" }],
        title: "Edit a.ts",
      }),
    );
    // Running: the live preview; finished: the output.
    expect(getExternalToolContent(part, meta).diffs).toHaveLength(1);
    expect(
      getExternalToolContent(
        { ...part, output: { text: "done" }, state: "output-available" },
        meta,
      ),
    ).toEqual({ text: "done" });
    expect(
      getExternalToolMeta({ ...part, callProviderMetadata: {} }),
    ).toBeNull();
  });

  it("shows one button per decision, with the agent's labels", () => {
    expect(
      getApprovalButtons([
        { kind: "reject_always", name: "Never", optionId: "ra" },
        { kind: "reject_once", name: "Reject", optionId: "ro" },
        { kind: "allow_always", name: "Always allow", optionId: "aa" },
        { kind: "allow_once", name: "Allow", optionId: "ao" },
        { kind: null, name: "Odd", optionId: "x" },
      ]),
    ).toEqual([
      { decision: "accept", label: "Allow", optionId: "ao" },
      { decision: "acceptForSession", label: "Always allow", optionId: "aa" },
      { decision: "decline", label: "Reject", optionId: "ro" },
    ]);
  });
});

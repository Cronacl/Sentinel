import { describe, expect, it } from "bun:test";

import { resolveRenderer } from "./registry";
import { GCalCreateEventTool } from "./renderers/integrations/gcal/gcal-create-event";
import { IntegrationGenericTool } from "./renderers/integrations/shared/generic";

describe("resolveRenderer", () => {
  it("uses the generic integration renderer for approval-requested integration tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { summary: "Sentinel Test Event" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      toolName: "gcal_create_event",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(IntegrationGenericTool);
  });

  it("uses the generic integration renderer for approval-requested static integration tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { summary: "Sentinel Test Event" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      type: "tool-gcal_create_event",
    } as const);

    expect(renderer).toBe(IntegrationGenericTool);
  });

  it("keeps the specialized integration renderer for completed integration tools", () => {
    const renderer = resolveRenderer({
      input: {
        endDateTime: "2026-03-16T11:00:00Z",
        startDateTime: "2026-03-16T10:00:00Z",
        summary: "Sentinel Test Event",
      },
      output: {
        end: "2026-03-16T11:00:00Z",
        htmlLink: "https://calendar.google.com",
        id: "event-1",
        start: "2026-03-16T10:00:00Z",
        status: "created",
        summary: "Sentinel Test Event",
      },
      state: "output-available",
      toolCallId: "tool-call-1",
      toolName: "gcal_create_event",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(GCalCreateEventTool);
  });
});

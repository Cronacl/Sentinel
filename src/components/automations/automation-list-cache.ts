import type { RouterOutputs } from "@/trpc/react";

type AutomationList = RouterOutputs["automations"]["list"];
type AutomationListItem = AutomationList["active"][number];

function withoutAutomation(list: AutomationList, id: string): AutomationList {
  return {
    active: list.active.filter((automation) => automation.id !== id),
    paused: list.paused.filter((automation) => automation.id !== id),
  };
}

export function upsertAutomationInList(
  current: AutomationList | undefined,
  automation: AutomationListItem,
): AutomationList {
  const base = current ?? { active: [], paused: [] };
  const existing =
    base.active.find((item) => item.id === automation.id) ??
    base.paused.find((item) => item.id === automation.id);
  const mergedAutomation = {
    ...automation,
    workspace: automation.workspace ?? existing?.workspace ?? null,
  };
  const next = withoutAutomation(base, automation.id);

  if (mergedAutomation.status === "active") {
    return { ...next, active: [mergedAutomation, ...next.active] };
  }

  return { ...next, paused: [mergedAutomation, ...next.paused] };
}

export function removeAutomationFromList(
  current: AutomationList | undefined,
  id: string,
): AutomationList | undefined {
  if (!current) return current;
  return withoutAutomation(current, id);
}

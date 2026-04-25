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
  const next = withoutAutomation(base, automation.id);

  if (automation.status === "active") {
    return { ...next, active: [automation, ...next.active] };
  }

  return { ...next, paused: [automation, ...next.paused] };
}

export function removeAutomationFromList(
  current: AutomationList | undefined,
  id: string,
): AutomationList | undefined {
  if (!current) return current;
  return withoutAutomation(current, id);
}

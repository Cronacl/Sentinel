import { getDriverLabel } from "@/lib/ai/chat/engines/catalog";

import type { ChatComposerEngineOption } from "../chat-composer-helpers";

// The composer's engine menu: one entry per driver, in catalog order. A
// driver with one instance is a plain entry; a driver with several becomes
// a section headed by the driver, its instances underneath with their
// accent colours.

export type ComposerEngineMenuEntry =
  | { kind: "option"; option: ChatComposerEngineOption }
  | {
      driver: string;
      kind: "group";
      label: string;
      options: ChatComposerEngineOption[];
    };

export function groupComposerEngineOptions(
  options: readonly ChatComposerEngineOption[],
): ComposerEngineMenuEntry[] {
  const byDriver = new Map<string, ChatComposerEngineOption[]>();
  for (const option of options) {
    const group = byDriver.get(option.engine);
    if (group) {
      group.push(option);
    } else {
      byDriver.set(option.engine, [option]);
    }
  }

  return [...byDriver].map(([driver, driverOptions]) =>
    driverOptions.length === 1
      ? { kind: "option", option: driverOptions[0]! }
      : {
          driver,
          kind: "group",
          label: getDriverLabel(driver),
          options: driverOptions,
        },
  );
}

/**
 * What the menu's "Engine" row shows for the selection: the instance's
 * label, plus its accent colour when its driver has several instances (a
 * null accent there shows a neutral dot).
 */
export function getSelectedEngineSummary(
  options: readonly ChatComposerEngineOption[],
  selectedInstanceId: string,
  selectedEngine: string,
): { accentColor: string | null; label: string; showAccent: boolean } {
  const selected = options.find(
    (option) => option.instanceId === selectedInstanceId,
  );
  if (!selected) {
    return {
      accentColor: null,
      label: getDriverLabel(selectedEngine),
      showAccent: false,
    };
  }
  const showAccent =
    options.filter((option) => option.engine === selected.engine).length > 1;
  return {
    accentColor: showAccent ? selected.accentColor : null,
    label: selected.label,
    showAccent,
  };
}

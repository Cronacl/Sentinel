import { describe, expect, it } from "bun:test";

import { FALLBACK_CHAT_ENGINE_OPTIONS } from "../chat-composer-helpers";
import {
  getSelectedEngineSummary,
  groupComposerEngineOptions,
} from "./engine-menu.helpers";

const [sentinel, codex, claude] = FALLBACK_CHAT_ENGINE_OPTIONS;
const codexWork = {
  ...codex!,
  accentColor: "#16a34a",
  instanceId: "codex-work",
  isDefaultInstance: false,
  label: "Codex work",
};
const codexPersonal = {
  ...codex!,
  instanceId: "codex-personal",
  isDefaultInstance: false,
  label: "Personal",
};

describe("groupComposerEngineOptions", () => {
  it("keeps a flat entry for drivers with a single instance", () => {
    expect(
      groupComposerEngineOptions([sentinel!, codex!, claude!]).map(
        (entry) => entry.kind,
      ),
    ).toEqual(["option", "option", "option"]);
  });

  it("groups a driver's instances under the driver, in catalog order", () => {
    const entries = groupComposerEngineOptions([
      sentinel!,
      codex!,
      codexWork,
      claude!,
      codexPersonal,
    ]);

    expect(entries).toEqual([
      { kind: "option", option: sentinel! },
      {
        driver: "codex",
        kind: "group",
        label: "Codex",
        options: [codex!, codexWork, codexPersonal],
      },
      { kind: "option", option: claude! },
    ]);
  });
});

describe("getSelectedEngineSummary", () => {
  it("names the selected instance and shows its accent among siblings", () => {
    expect(
      getSelectedEngineSummary([codex!, codexWork], "codex-work", "codex"),
    ).toEqual({
      accentColor: "#16a34a",
      label: "Codex work",
      showAccent: true,
    });
    expect(
      getSelectedEngineSummary(
        [codex!, codexPersonal],
        "codex-personal",
        "codex",
      ),
    ).toEqual({ accentColor: null, label: "Personal", showAccent: true });
  });

  it("shows only the label for a driver with one instance", () => {
    expect(
      getSelectedEngineSummary([sentinel!, codexWork], "codex-work", "codex"),
    ).toEqual({ accentColor: null, label: "Codex work", showAccent: false });
  });

  it("falls back to the driver label before the catalog lists the instance", () => {
    expect(getSelectedEngineSummary([], "claude", "claude")).toEqual({
      accentColor: null,
      label: "Claude",
      showAccent: false,
    });
  });
});

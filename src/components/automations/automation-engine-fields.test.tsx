import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FALLBACK_CHAT_ENGINE_OPTIONS } from "@/components/chat/chat-composer-helpers";

import {
  AutomationEngineFields,
  AutomationModelOptionFields,
} from "./automation-engine-fields";
import { AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE } from "./automation-form-helpers";

const codex = FALLBACK_CHAT_ENGINE_OPTIONS.find(
  (option) => option.engine === "codex",
)!;
const codexWork = {
  ...codex,
  accentColor: "#16a34a",
  instanceId: "codex-work",
  isDefaultInstance: false,
  label: "Codex work",
};

describe("AutomationEngineFields", () => {
  it("adds the instance picker when the driver has several instances", () => {
    const markup = renderToStaticMarkup(
      <AutomationEngineFields
        catalogOptions={[codex, codexWork]}
        driver="codex"
        instanceId="codex-work"
        notice="Runs unattended."
        onInstanceChange={() => {}}
      />,
    );

    expect(markup).toContain("Engine");
    expect(markup).toContain("Instance");
    expect(markup).toContain("Codex work");
    expect(markup).toContain("background-color:#16a34a");
    expect(markup).toContain("Runs unattended.");
  });

  it("shows only the engine for a driver's single default instance", () => {
    const markup = renderToStaticMarkup(
      <AutomationEngineFields
        catalogOptions={[codex]}
        driver="codex"
        instanceId="codex"
        onInstanceChange={() => {}}
      />,
    );

    expect(markup).not.toContain(">Instance<");
  });

  it("says when the automation's instance is gone", () => {
    const markup = renderToStaticMarkup(
      <AutomationEngineFields
        catalogOptions={[codex]}
        driver="codex"
        instanceId="codex-gone"
        notice="Runs unattended."
        onInstanceChange={() => {}}
      />,
    );

    expect(markup).toContain(AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE);
    expect(markup).not.toContain("Runs unattended.");
  });
});

describe("AutomationModelOptionFields", () => {
  it("renders one picker per option, at the model default when unset", () => {
    const markup = renderToStaticMarkup(
      <AutomationModelOptionFields
        descriptors={[
          {
            choices: [
              { id: "build", isDefault: true, label: "Build" },
              { id: "plan", label: "Plan" },
            ],
            id: "agent",
            label: "Agent",
            type: "select",
          },
        ]}
        onChange={() => {}}
        values={{}}
      />,
    );

    expect(markup).toContain("Agent");
    expect(markup).toContain("Model default (Build)");
  });

  it("renders nothing for a model without options", () => {
    expect(
      renderToStaticMarkup(
        <AutomationModelOptionFields
          descriptors={[]}
          onChange={() => {}}
          values={{}}
        />,
      ),
    ).toBe("");
  });
});

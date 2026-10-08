import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

// The card also hosts the sign-in panel and the install/update controls,
// which talk to tRPC; they have their own tests, so render them as stubs.
mock.module("./engine-auth-panel", () => ({
  EngineAuthPanel: () => null,
}));
mock.module("./engine-maintenance-actions", () => ({
  EngineMaintenanceButton: () => null,
  EngineMaintenanceProgress: () => null,
}));

const { EngineEnvEditor } = await import("./engine-env-editor");
const { EngineInstanceCard } = await import("./engine-instance-card");
const { EngineDriverSection } = await import("./engine-instance-manager");
const { toEnvVarDrafts } = await import("./instance-management");

describe("EngineEnvEditor", () => {
  const markup = renderToStaticMarkup(
    <EngineEnvEditor
      drafts={toEnvVarDrafts([
        {
          name: "OPENAI_API_KEY",
          needsReentry: true,
          sensitive: true,
          value: "",
          valueRedacted: true,
        },
        {
          name: "OPENAI_BASE_URL",
          needsReentry: false,
          sensitive: false,
          value: "https://proxy.example",
          valueRedacted: false,
        },
      ])}
      onChange={() => {}}
    />,
  );

  it("never shows a stored secret and masks secret fields", () => {
    expect(markup).toContain('type="password"');
    expect(markup).toContain("Stored secret: type to replace");
    expect(markup).toContain('value="https://proxy.example"');
  });

  it("asks to re-enter a value that no longer decrypts", () => {
    expect(markup).toContain("Re-enter");
  });
});

describe("Settings → Engines instance pieces", () => {
  it("renders a driver section with its add action and isolation note", () => {
    const markup = renderToStaticMarkup(
      <EngineDriverSection driver="cursor" onAdd={() => {}}>
        <span>card</span>
      </EngineDriverSection>,
    );

    expect(markup).toContain("Cursor");
    expect(markup).toContain("Add instance");
    expect(markup).toContain("share the CLI&#x27;s sign-in and settings");
  });

  it("shows the instance's accent colour and its actions on the card", () => {
    const markup = renderToStaticMarkup(
      <EngineInstanceCard
        actions={<button type="button">manage</button>}
        isRefreshing={false}
        onRefresh={() => {}}
        snapshot={makeFakeSnapshot({
          accentColor: "#16a34a",
          instanceId: "codex-work",
          isDefaultInstance: false,
          label: "Codex work",
        })}
      />,
    );

    expect(markup).toContain("background-color:#16a34a");
    expect(markup).toContain("manage");
    expect(markup).toContain("codex-work");
  });
});

import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  EngineAuthFlowState,
  EngineAuthInteraction,
} from "@/lib/ai/chat/engines/contract";

// The sign-in panel's flow steps as markup: what each interaction shows.
// The embedded terminal (xterm, the desktop bridge) and tRPC are stubbed.

mock.module("@/trpc/react", () => ({ api: {} }));
mock.module("./engine-auth-terminal", () => ({
  EngineAuthTerminal: ({
    interaction,
  }: {
    interaction: { launch?: { ticket: string } | null };
  }) => <div data-terminal-ticket={interaction.launch?.ticket ?? ""} />,
}));

const { EngineAuthFlowStep } = await import("./engine-auth-panel");

const TICKET = "b".repeat(64);

function waiting(interaction: EngineAuthInteraction, message: string) {
  return {
    expiresAt: "2026-10-08T00:15:00.000Z",
    flowId: "flow-1",
    instanceId: "claude",
    interaction,
    message,
    methodId: "cli-login",
    phase: "waiting",
    purpose: "login",
  } satisfies EngineAuthFlowState;
}

function render(state: EngineAuthFlowState, embedTerminal = false) {
  return renderToStaticMarkup(
    <EngineAuthFlowStep
      embedTerminal={embedTerminal}
      isResponding={false}
      onCancel={() => {}}
      onRespond={() => {}}
      state={state}
    />,
  );
}

const terminal = {
  args: ["auth", "login"],
  command: "/opt/bin/claude",
  cwd: "/Users/me",
  displayCommand: "CLAUDE_CONFIG_DIR=/cfg /opt/bin/claude auth login",
  env: { CLAUDE_CONFIG_DIR: "/cfg" },
  id: "flow-1:1",
  launch: { expiresAt: "2026-10-08T00:05:00.000Z", ticket: TICKET },
  title: "Claude Code sign-in",
  type: "terminal-command",
} satisfies EngineAuthInteraction;

describe("EngineAuthFlowStep", () => {
  it("embeds the terminal on desktop and offers only Cancel while it runs", () => {
    const markup = render(
      waiting(terminal, "Finish signing in in the terminal."),
      true,
    );
    expect(markup).toContain(`data-terminal-ticket="${TICKET}"`);
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Done");
    // "Check sign-in" appears only once the command exited.
    expect(markup).not.toContain("Check sign-in");
  });

  it("shows the command to copy and Done without an embedded terminal", () => {
    const markup = render(
      waiting(
        { ...terminal, launch: null },
        "Run this command in a terminal, then confirm here.",
      ),
    );
    expect(markup).not.toContain("data-terminal-ticket");
    expect(markup).toContain(
      "CLAUDE_CONFIG_DIR=/cfg /opt/bin/claude auth login",
    );
    expect(markup).toContain("Done");
  });

  it("asks for credentials in password fields that start empty", () => {
    const markup = render(
      waiting(
        {
          description: "Stored encrypted as ANTHROPIC_API_KEY.",
          fields: [
            {
              label: "Anthropic API key",
              name: "ANTHROPIC_API_KEY",
              secret: true,
            },
          ],
          id: "flow-1:2",
          type: "credentials",
        },
        "Enter the key.",
      ),
    );
    expect(markup).toContain("Anthropic API key");
    expect(markup).toContain('type="password"');
    expect(markup).toMatch(/autocomplete="off"/i);
    expect(markup).toContain('value=""');
    expect(markup).toContain("Stored encrypted as ANTHROPIC_API_KEY.");
    expect(markup).toContain("Save");
  });

  it("shows a device code and the page to enter it on", () => {
    const markup = render(
      waiting(
        {
          id: "flow-1:3",
          type: "device-code",
          url: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
        },
        "Enter the code on the ChatGPT page.",
      ),
    );
    expect(markup).toContain("ABCD-EFGH");
    expect(markup).toContain("Open sign-in page");
  });

  it("shows progress while verifying", () => {
    const markup = render({
      ...waiting(terminal, "Checking the sign-in…"),
      interaction: null,
      phase: "verifying",
    });
    expect(markup).toContain("Checking the sign-in…");
    expect(markup).not.toContain("Cancel");
  });
});

import { describe, expect, it } from "bun:test";

import { toComposerEngineOption } from "./composer-catalog";
import { makeFakeSnapshot } from "./contract/testing";
import {
  CODEX_SLASH_COMMANDS,
  canRunSentinelSlashCommands,
  normalizeEngineSlashCommands,
  resolveComposerSlashCommands,
} from "./slash-commands";

describe("slash commands", () => {
  it("keeps valid, distinct runtime commands", () => {
    expect(
      normalizeEngineSlashCommands(
        [
          { description: " Review a PR ", inputHint: "<pr>", name: "/review" },
          { description: "dupe", name: "Review" },
          { name: "has space" },
          { name: "" },
          { description: null, name: "plugin:skill" },
        ],
        "native",
      ),
    ).toEqual([
      {
        description: "Review a PR",
        inputHint: "<pr>",
        name: "review",
        source: "native",
      },
      { name: "plugin:skill", source: "native" },
    ]);
  });

  it("builds the composer menu from an instance's commands", () => {
    expect(
      resolveComposerSlashCommands({
        driver: "claude",
        slashCommands: [
          { name: "compact", source: "native" },
          {
            description: "Ship it",
            inputHint: "<branch>",
            name: "ship",
            source: "native",
          },
        ],
      }),
    ).toEqual([
      { command: "compact", description: "Run /compact", mode: "insert" },
      {
        command: "ship",
        description: "Ship it",
        inputHint: "<branch>",
        mode: "insert",
      },
    ]);
    expect(
      resolveComposerSlashCommands({
        driver: "codex",
        slashCommands: CODEX_SLASH_COMMANDS,
      }).map((command) => command.mode),
    ).toEqual(["execute", "execute", "execute"]);
  });

  it("falls back to a driver's long-standing commands", () => {
    expect(
      resolveComposerSlashCommands({ driver: "codex", slashCommands: [] }).map(
        (command) => command.command,
      ),
    ).toEqual(["compact", "review", "rollback"]);
    expect(
      resolveComposerSlashCommands({ driver: "claude" }).length,
    ).toBeGreaterThan(0);
    expect(resolveComposerSlashCommands({ driver: "copilot" })).toEqual([]);
  });

  it("puts reported commands on the composer's engine option", () => {
    expect(
      toComposerEngineOption(
        makeFakeSnapshot({
          driver: "codex",
          slashCommands: [...CODEX_SLASH_COMMANDS],
        }),
      ).slashCommands,
    ).toEqual([...CODEX_SLASH_COMMANDS]);
    expect(
      "slashCommands" in toComposerEngineOption(makeFakeSnapshot()),
    ).toBeFalse();
  });

  it("runs Sentinel commands only on a thread with a native session", () => {
    expect(
      canRunSentinelSlashCommands({ driver: "codex", hasCodexThread: true }),
    ).toBeTrue();
    expect(
      canRunSentinelSlashCommands({ driver: "codex", hasCodexThread: false }),
    ).toBeFalse();
    expect(
      canRunSentinelSlashCommands({ driver: "claude", hasCodexThread: true }),
    ).toBeFalse();
  });
});

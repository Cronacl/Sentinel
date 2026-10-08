import { describe, expect, it } from "bun:test";

import { toComposerEngineOption } from "./composer-catalog";
import { makeFakeSnapshot } from "./contract/testing";
import {
  CODEX_SLASH_COMMANDS,
  canRunSentinelSlashCommands,
  getRunnableComposerSlashCommands,
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

  it("builds the composer menu from what the instance reports", () => {
    // Claude: the CLI's own commands, inserted as `/name ` prompt text,
    // on new threads too.
    const claude = resolveComposerSlashCommands({
      driver: "claude",
      slashCommands: normalizeEngineSlashCommands(
        [
          { description: "Review a PR", inputHint: "<pr>", name: "review-pr" },
          { name: "compact" },
        ],
        "native",
      ),
    });
    expect(
      getRunnableComposerSlashCommands(claude, {
        actions: new Set(),
        canExecute: false,
      }),
    ).toEqual([
      {
        command: "review-pr",
        description: "Review a PR",
        inputHint: "<pr>",
        mode: "insert",
      },
      { command: "compact", description: "Run /compact", mode: "insert" },
    ]);

    // Codex: Sentinel runs them, so only on a thread that has a Codex
    // thread, and only those the composer has an action for.
    const codex = resolveComposerSlashCommands({
      driver: "codex",
      slashCommands: [...CODEX_SLASH_COMMANDS],
    });
    const actions = new Set(["compact", "review"]);
    expect(
      getRunnableComposerSlashCommands(codex, { actions, canExecute: false }),
    ).toEqual([]);
    expect(
      getRunnableComposerSlashCommands(codex, {
        actions,
        canExecute: true,
      }).map((command) => command.command),
    ).toEqual(["compact", "review"]);
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

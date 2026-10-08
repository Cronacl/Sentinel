import { describe, expect, it } from "bun:test";

import {
  makeFakeModel,
  makeFakeSnapshot,
} from "@/lib/ai/chat/engines/contract/testing";
import type { EngineInstanceSummary } from "@/lib/ai/chat/engines/contract";

import {
  KEEP_OPTIONS,
  NO_OPTIONS,
  buildCreateInstanceInput,
  buildUpdateInstancePatch,
  canAddEngineInstance,
  describeEngineInstanceReferences,
  describeInstanceChange,
  draftFromSummary,
  emptyCustomModelDraft,
  emptyEnvVarDraft,
  emptyInstanceFormDraft,
  getCustomModelIdHint,
  getHomeChangeNotice,
  getInstanceIsolationNote,
  getOptionTemplateModels,
  groupEngineSnapshotsByDriver,
  toCustomModelDrafts,
  toCustomModels,
  toEnvVarDrafts,
  toEnvVarInputs,
  updateEnvVarDraft,
  validateInstanceFormDraft,
} from "./instance-management";

function summary(
  overrides: Partial<EngineInstanceSummary> = {},
): EngineInstanceSummary {
  return {
    accentColor: null,
    availability: "available",
    config: {},
    customModels: [],
    driver: "codex",
    enabled: true,
    environment: [],
    id: "codex-work",
    isDefault: false,
    label: "Codex work",
    persisted: true,
    sortOrder: 1,
    unavailableReason: null,
    ...overrides,
  };
}

const effort = {
  choices: [
    { id: "low", label: "Low" },
    { id: "high", isDefault: true, label: "High" },
  ],
  id: "effort",
  label: "Reasoning",
  role: "reasoning" as const,
  type: "select" as const,
};

describe("drivers and isolation", () => {
  it("adds instances only for implemented external drivers", () => {
    expect(canAddEngineInstance("codex")).toBe(true);
    expect(canAddEngineInstance("cursor")).toBe(true);
    expect(canAddEngineInstance("sentinel")).toBe(false);
    expect(canAddEngineInstance("grok")).toBe(false);
    expect(canAddEngineInstance("gemini")).toBe(false);
  });

  it("says which drivers share credentials across instances", () => {
    expect(getInstanceIsolationNote("codex")).toContain("CODEX_HOME");
    expect(getInstanceIsolationNote("claude")).toContain("CLAUDE_CONFIG_DIR");
    expect(getInstanceIsolationNote("copilot")).toContain("COPILOT_HOME");
    for (const driver of ["cursor", "opencode", "pi"]) {
      expect(getInstanceIsolationNote(driver)).toContain(
        "share the CLI's sign-in and settings",
      );
    }
    expect(getInstanceIsolationNote("gemini")).toBeNull();
  });

  it("groups snapshots by driver in the order drivers appear", () => {
    const groups = groupEngineSnapshotsByDriver([
      makeFakeSnapshot({ driver: "codex" }),
      makeFakeSnapshot({ driver: "codex", instanceId: "codex-work" }),
      makeFakeSnapshot({ driver: "claude" }),
      makeFakeSnapshot({ driver: "gemini", instanceId: "gemini" }),
    ]);

    expect(
      groups.map((group) => [
        group.driver,
        group.label,
        group.snapshots.map((snapshot) => snapshot.instanceId),
      ]),
    ).toEqual([
      ["codex", "Codex", ["codex", "codex-work"]],
      ["claude", "Claude", ["claude"]],
      ["gemini", "gemini", ["gemini"]],
    ]);
  });
});

describe("in-use guard", () => {
  it("describes what still uses an instance", () => {
    expect(
      describeEngineInstanceReferences({
        automations: 0,
        threads: 0,
        userDefault: false,
      }),
    ).toBeNull();
    expect(
      describeEngineInstanceReferences({
        automations: 0,
        threads: 1,
        userDefault: false,
      }),
    ).toBe("1 thread");
    expect(
      describeEngineInstanceReferences({
        automations: 2,
        threads: 3,
        userDefault: true,
      }),
    ).toBe("3 threads, 2 automations and your default engine");
  });

  it("explains a forced removal, including the default moving", () => {
    const text = describeInstanceChange({
      action: "remove",
      inUseBy: "3 threads and your default engine",
      summary: summary(),
      userDefault: true,
    });

    expect(text.title).toBe("Remove Codex work?");
    expect(text.body).toContain("stop running");
    expect(text.body).toContain("default Codex instance");
    expect(
      describeInstanceChange({
        action: "remove",
        inUseBy: null,
        summary: summary(),
        userDefault: false,
      }).body,
    ).toBe(
      "Its settings, environment variables and custom models are deleted.",
    );
  });

  it("explains disabling and resetting an instance in use", () => {
    expect(
      describeInstanceChange({
        action: "disable",
        inUseBy: "1 automation",
        summary: summary(),
        userDefault: false,
      }).body,
    ).toContain("cannot run on it until you enable it again");
    expect(
      describeInstanceChange({
        action: "reset",
        inUseBy: "1 thread",
        summary: summary({ id: "codex", isDefault: true, label: "Codex" }),
        userDefault: false,
      }).body,
    ).toContain("Threads keep running on it");
  });
});

describe("environment drafts", () => {
  const stored = [
    {
      name: "OPENAI_API_KEY",
      needsReentry: false,
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
  ];

  it("echoes stored secrets back redacted and plain values as they are", () => {
    expect(toEnvVarInputs(toEnvVarDrafts(stored))).toEqual({
      environment: [
        {
          name: "OPENAI_API_KEY",
          sensitive: true,
          value: "",
          valueRedacted: true,
        },
        {
          name: "OPENAI_BASE_URL",
          sensitive: false,
          value: "https://proxy.example",
        },
      ],
    });
  });

  it("replaces a stored secret once a new value is typed", () => {
    const [secret] = toEnvVarDrafts(stored);
    const edited = updateEnvVarDraft(secret!, { value: "sk-new" });

    expect(edited.valueRedacted).toBe(false);
    expect(toEnvVarInputs([edited])).toEqual({
      environment: [
        { name: "OPENAI_API_KEY", sensitive: true, value: "sk-new" },
      ],
    });
  });

  it("needs a new value to turn a stored secret into a plain variable", () => {
    const [secret] = toEnvVarDrafts(stored);
    const plain = updateEnvVarDraft(secret!, { sensitive: false });

    expect(toEnvVarInputs([plain])).toEqual({
      error:
        "Enter a new value for OPENAI_API_KEY to store it as a plain variable.",
    });
    expect(
      toEnvVarInputs([updateEnvVarDraft(plain, { value: "visible" })]),
    ).toEqual({
      environment: [
        { name: "OPENAI_API_KEY", sensitive: false, value: "visible" },
      ],
    });
  });

  it("drops blank rows and rejects bad or repeated names", () => {
    expect(toEnvVarInputs([emptyEnvVarDraft()])).toEqual({ environment: [] });
    expect(
      toEnvVarInputs([
        updateEnvVarDraft(emptyEnvVarDraft(), { value: "orphan" }),
      ]),
    ).toEqual({ error: "Name every environment variable or remove its row." });
    expect(
      "error" in
        toEnvVarInputs([
          updateEnvVarDraft(emptyEnvVarDraft(), { name: "1BAD", value: "x" }),
        ]),
    ).toBe(true);
    expect(
      toEnvVarInputs([
        updateEnvVarDraft(emptyEnvVarDraft(), { name: "A", value: "1" }),
        updateEnvVarDraft(emptyEnvVarDraft(), { name: " A ", value: "2" }),
      ]),
    ).toEqual({ error: "A is listed twice." });
  });
});

describe("instance form", () => {
  it("builds a create input with only what was entered", () => {
    expect(buildCreateInstanceInput("codex", emptyInstanceFormDraft())).toEqual(
      { driver: "codex" },
    );
    expect(
      buildCreateInstanceInput("codex", {
        accentColor: "#16a34a",
        binaryPath: " /opt/codex/bin/codex ",
        environment: [
          updateEnvVarDraft(emptyEnvVarDraft(), {
            name: "OPENAI_API_KEY",
            value: "sk-work",
          }),
        ],
        homePath: "~/.codex-work",
        label: " Work ",
      }),
    ).toEqual({
      accentColor: "#16a34a",
      config: { binaryPath: "/opt/codex/bin/codex", homePath: "~/.codex-work" },
      driver: "codex",
      environment: [
        { name: "OPENAI_API_KEY", sensitive: true, value: "sk-work" },
      ],
      label: "Work",
    });
  });

  it("never sends a home directory for drivers without one", () => {
    expect(
      buildCreateInstanceInput("cursor", {
        ...emptyInstanceFormDraft(),
        homePath: "~/.cursor-work",
      }),
    ).toEqual({ driver: "cursor" });
  });

  it("patches only what changed and keeps the config keys it does not edit", () => {
    const current = summary({
      config: { binaryPath: "/opt/codex", launchArgs: ["--verbose"] },
      environment: [
        {
          name: "OPENAI_API_KEY",
          needsReentry: false,
          sensitive: true,
          value: "",
          valueRedacted: true,
        },
      ],
    });
    const unchanged = draftFromSummary(current);

    expect(buildUpdateInstancePatch(current, unchanged)).toEqual({});
    expect(
      buildUpdateInstancePatch(current, {
        ...unchanged,
        accentColor: "#dc2626",
        homePath: "~/.codex-work",
        label: "Work",
      }),
    ).toEqual({
      accentColor: "#dc2626",
      config: {
        binaryPath: "/opt/codex",
        homePath: "~/.codex-work",
        launchArgs: ["--verbose"],
      },
      label: "Work",
    });
    expect(
      buildUpdateInstancePatch(current, { ...unchanged, binaryPath: "" }),
    ).toEqual({ config: { launchArgs: ["--verbose"] } });
  });

  it("clears the accent colour and sends the whole environment when it changes", () => {
    const current = summary({ accentColor: "#2563eb" });
    const draft = draftFromSummary(current);

    expect(
      buildUpdateInstancePatch(current, {
        ...draft,
        accentColor: null,
        environment: [
          updateEnvVarDraft(emptyEnvVarDraft(), { name: "A", value: "1" }),
        ],
      }),
    ).toEqual({
      accentColor: null,
      environment: [{ name: "A", sensitive: true, value: "1" }],
    });
  });

  it("validates names, colours and paths", () => {
    const draft = emptyInstanceFormDraft();

    expect(validateInstanceFormDraft(draft, "codex")).toBeNull();
    expect(
      validateInstanceFormDraft({ ...draft, label: "x".repeat(65) }, "codex"),
    ).toBe("Names are at most 64 characters.");
    expect(
      validateInstanceFormDraft({ ...draft, accentColor: "red" }, "codex"),
    ).toBe("Accent colours are #rrggbb hex values.");
    expect(
      validateInstanceFormDraft({ ...draft, binaryPath: "bin/codex" }, "codex"),
    ).toBe("The binary path must be absolute (or start with ~/).");
    expect(
      validateInstanceFormDraft({ ...draft, homePath: "codex-home" }, "codex"),
    ).toBe("The home directory must be absolute (or start with ~/).");
    expect(
      validateInstanceFormDraft(
        { ...draft, binaryPath: "C:\\Tools\\codex.exe" },
        "codex",
      ),
    ).toBeNull();
  });

  it("warns that a new home starts new native sessions", () => {
    const current = summary({ config: { homePath: "~/.codex-a" } });

    expect(getHomeChangeNotice(current, { homePath: "~/.codex-a" })).toBeNull();
    expect(getHomeChangeNotice(current, { homePath: "~/.codex-b" })).toContain(
      "start new Codex sessions",
    );
    expect(
      getHomeChangeNotice(summary({ driver: "cursor" }), { homePath: "/x" }),
    ).toBeNull();
  });
});

describe("custom models", () => {
  const reported = [
    makeFakeModel({ id: "gpt-6", name: "GPT-6", options: [effort] }),
    makeFakeModel({ id: "gpt-6-mini", name: "GPT-6 mini" }),
    makeFakeModel({
      id: "o9",
      isCustom: true,
      options: [effort],
      source: "custom",
    }),
  ];

  it("offers reported models with options as templates", () => {
    expect(getOptionTemplateModels(reported).map((model) => model.id)).toEqual([
      "gpt-6",
    ]);
  });

  it("keeps stored options, copies a template's, or stores none", () => {
    const [kept] = toCustomModelDrafts([
      { id: "o9", name: "o9 beta", options: [effort] },
    ]);
    expect(kept?.optionsFrom).toBe(KEEP_OPTIONS);

    const copied = {
      ...emptyCustomModelDraft(),
      id: "gpt-6-preview",
      optionsFrom: "gpt-6",
    };
    const bare = { ...emptyCustomModelDraft(), id: "gpt-6-nano", name: "" };

    expect(
      toCustomModels([kept!, copied, bare, emptyCustomModelDraft()], reported),
    ).toEqual({
      customModels: [
        { id: "o9", name: "o9 beta", options: [effort] },
        { id: "gpt-6-preview", options: [effort] },
        { id: "gpt-6-nano" },
      ],
    });
    expect(
      toCustomModels([{ ...kept!, optionsFrom: NO_OPTIONS }], reported),
    ).toEqual({ customModels: [{ id: "o9", name: "o9 beta" }] });
  });

  it("rejects missing, invalid and repeated ids", () => {
    expect(
      toCustomModels(
        [{ ...emptyCustomModelDraft(), name: "Nameless" }],
        reported,
      ),
    ).toEqual({ error: "Give every custom model an id or remove its row." });
    expect(
      "error" in
        toCustomModels(
          [{ ...emptyCustomModelDraft(), id: "has space" }],
          reported,
        ),
    ).toBe(true);
    expect(
      toCustomModels(
        [
          { ...emptyCustomModelDraft(), id: "o9" },
          { ...emptyCustomModelDraft(), id: " o9 " },
        ],
        reported,
      ),
    ).toEqual({ error: "o9 is listed twice." });
  });

  it("hints at provider/model ids when the engine uses them", () => {
    expect(getCustomModelIdHint([{ id: "anthropic/claude-5" }])).toContain(
      "provider/model like anthropic/claude-5",
    );
    expect(getCustomModelIdHint([{ id: "gpt-6" }])).toBe(
      "The id the engine accepts as its model name.",
    );
  });
});

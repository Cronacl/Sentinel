import { describe, expect, it } from "bun:test";

import {
  readElicitationFields,
  toElicitationContent,
  isOpenableElicitationUrl,
} from "./elicitation";
import type { ExternalPermissionOption } from "./mirror";
import {
  autoApproveOutcome,
  autoDenyOutcome,
  resolvePermissionDisposition,
  selectPermissionOutcome,
  toExternalDecision,
} from "./permissions";
import { parseQuestionResponse, type ExternalQuestion } from "./user-input";

const ALL: ExternalPermissionOption[] = [
  { kind: "allow_once", name: "Allow", optionId: "ao" },
  { kind: "allow_always", name: "Always", optionId: "aa" },
  { kind: "reject_once", name: "Reject", optionId: "ro" },
  { kind: "reject_always", name: "Never", optionId: "ra" },
];

function selectedId(outcome: ReturnType<typeof selectPermissionOutcome>) {
  return outcome.outcome.outcome === "selected"
    ? outcome.outcome.optionId
    : "cancelled";
}

describe("selectPermissionOutcome", () => {
  it("maps each decision onto its option kind", () => {
    const cases = [
      ["accept", "ao"],
      ["acceptForSession", "aa"],
      ["decline", "ro"],
      ["cancel", "cancelled"],
    ] as const;
    for (const [decision, expected] of cases) {
      expect([
        decision,
        selectedId(selectPermissionOutcome(ALL, decision)),
      ]).toEqual([decision, expected]);
    }
  });

  it("never escalates a one-time approval to always-allow", () => {
    const onlyAlways = ALL.filter((option) => option.kind !== "allow_once");
    expect(selectedId(selectPermissionOutcome(onlyAlways, "accept"))).toBe(
      "cancelled",
    );
    expect(
      selectedId(selectPermissionOutcome(onlyAlways, "acceptForSession")),
    ).toBe("aa");
  });

  it("falls back within the same intent", () => {
    const noOnce = ALL.filter(
      (option) =>
        option.kind !== "allow_always" && option.kind !== "reject_once",
    );
    expect(
      selectedId(selectPermissionOutcome(noOnce, "acceptForSession")),
    ).toBe("ao");
    expect(selectedId(selectPermissionOutcome(noOnce, "decline"))).toBe("ra");
  });

  it("auto-approves once and auto-denies once, else cancels", () => {
    expect(selectedId(autoApproveOutcome(ALL))).toBe("ao");
    expect(selectedId(autoDenyOutcome(ALL))).toBe("ro");
    expect(selectedId(autoDenyOutcome([]))).toBe("cancelled");
  });

  it("reads the decision a submitted approval carries", () => {
    expect(toExternalDecision({ approved: true })).toBe("accept");
    expect(toExternalDecision({ approved: false })).toBe("decline");
    expect(
      toExternalDecision({ approved: true, decision: "acceptForSession" }),
    ).toBe("acceptForSession");
    expect(toExternalDecision({ approved: true, decision: "weird" })).toBe(
      "accept",
    );
  });
});

describe("resolvePermissionDisposition", () => {
  const base = {
    interactive: true,
    kind: "execute" as const,
    permissionMode: "default" as const,
    toolsEnabled: true,
  };

  it("settles each mode and kind as the policy says", () => {
    const cases: Array<
      [Partial<Parameters<typeof resolvePermissionDisposition>[0]>, string]
    > = [
      [{}, "ask"],
      [{ kind: "read" as const }, "allow"],
      [{ kind: "search" as const }, "allow"],
      [{ permissionMode: "full" as const }, "allow"],
      [
        {
          editScope: "inside" as const,
          kind: "edit" as const,
          permissionMode: "accept_edits" as const,
        },
        "allow",
      ],
      [
        {
          editScope: "inside" as const,
          kind: "delete" as const,
          permissionMode: "auto" as const,
        },
        "allow",
      ],
      // An edit outside the workspace, or naming no file (Cursor's deletes).
      [
        {
          editScope: "outside" as const,
          kind: "edit" as const,
          permissionMode: "accept_edits" as const,
        },
        "ask",
      ],
      [
        { kind: "edit" as const, permissionMode: "accept_edits" as const },
        "ask",
      ],
      [{ editScope: "inside" as const, kind: "edit" as const }, "ask"],
      [{ permissionMode: "accept_edits" as const }, "ask"],
      [{ toolsEnabled: false, permissionMode: "full" as const }, "deny"],
      [{ interactive: false }, "deny"],
      [{ interactive: false, permissionMode: "full" as const }, "allow"],
    ];
    for (const [overrides, expected] of cases) {
      expect([
        overrides,
        resolvePermissionDisposition({ ...base, ...overrides }),
      ]).toEqual([overrides, expected]);
    }
  });
});

const QUESTIONS: ExternalQuestion[] = [
  {
    id: "db",
    multiSelect: false,
    options: [
      { id: "pg", label: "Postgres" },
      { id: "sqlite", label: "SQLite" },
    ],
    question: "Which database?",
  },
  {
    id: "extras",
    multiSelect: true,
    options: [
      { id: "auth", label: "Auth, sessions" },
      { id: "cache", label: "Cache" },
    ],
    question: "Extras?",
  },
];

describe("parseQuestionResponse", () => {
  it("answers every question from the card's serialized answers", () => {
    expect(
      parseQuestionResponse(
        QUESTIONS,
        "Which database?: SQLite\nExtras?: Auth, sessions, Cache\n\nAdditional context: keep it small",
      ),
    ).toEqual({
      additionalContext: "keep it small",
      answers: [
        { questionId: "db", selectedOptionIds: ["sqlite"] },
        { questionId: "extras", selectedOptionIds: ["auth", "cache"] },
      ],
    });
  });

  it("gives a bare label to the one question offering it", () => {
    expect(parseQuestionResponse(QUESTIONS, "Postgres")).toEqual({
      additionalContext: null,
      answers: [{ questionId: "db", selectedOptionIds: ["pg"] }],
    });
  });

  it("keeps free text for a lone question", () => {
    expect(parseQuestionResponse([QUESTIONS[0]!], "MySQL please")).toEqual({
      additionalContext: null,
      answers: [
        { questionId: "db", selectedOptionIds: [], text: "MySQL please" },
      ],
    });
  });
});

describe("form elicitations", () => {
  const schema = {
    properties: {
      confirm: { title: "Proceed?", type: "boolean" },
      count: { title: "How many", type: "integer" },
      env: {
        oneOf: [
          { const: "dev", title: "Development" },
          { const: "prod", title: "Production" },
        ],
        title: "Environment",
        type: "string",
      },
      tags: {
        items: { enum: ["a", "b"] },
        title: "Tags",
        type: "array",
      },
    },
    required: ["env"],
    type: "object",
  };

  it("turns the schema into questions and the answers into content", () => {
    const fields = readElicitationFields(schema);
    expect(fields.map((field) => [field.id, field.kind])).toEqual([
      ["confirm", "boolean"],
      ["count", "number"],
      ["env", "text"],
      ["tags", "multi"],
    ]);
    expect(
      toElicitationContent(fields, {
        additionalContext: null,
        answers: [
          { questionId: "confirm", selectedOptionIds: ["true"] },
          { questionId: "count", selectedOptionIds: [], text: "3" },
          { questionId: "env", selectedOptionIds: ["prod"] },
          { questionId: "tags", selectedOptionIds: ["a", "b"] },
        ],
      }),
    ).toEqual({ confirm: true, count: 3, env: "prod", tags: ["a", "b"] });
  });

  it("returns null when a required field is missing", () => {
    expect(
      toElicitationContent(readElicitationFields(schema), {
        additionalContext: null,
        answers: [],
      }),
    ).toBeNull();
  });

  it("only offers https or loopback http links", () => {
    expect(isOpenableElicitationUrl("https://example.com/login")).toBe(true);
    expect(isOpenableElicitationUrl("http://127.0.0.1:8080/cb")).toBe(true);
    expect(isOpenableElicitationUrl("http://example.com")).toBe(false);
    expect(isOpenableElicitationUrl("javascript:alert(1)")).toBe(false);
  });
});

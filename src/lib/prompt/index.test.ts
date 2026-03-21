import { describe, expect, it } from "bun:test";

import { each, lines, prompt, section, when } from "./index";

// ---------------------------------------------------------------------------
// lines()
// ---------------------------------------------------------------------------

describe("lines", () => {
  it("joins non-empty strings with double newlines", () => {
    expect(lines("A", "B", "C")).toBe("A\n\nB\n\nC");
  });

  it("filters out falsy and empty values", () => {
    expect(lines("A", null, "", undefined, "B", false, 0, "C")).toBe(
      "A\n\nB\n\nC",
    );
  });

  it("filters whitespace-only strings", () => {
    expect(lines("A", "   ", "\n", "B")).toBe("A\n\nB");
  });

  it("returns empty string when all inputs are falsy", () => {
    expect(lines(null, undefined, "", false)).toBe("");
  });

  it("returns empty string with no arguments", () => {
    expect(lines()).toBe("");
  });

  it("trims leading and trailing whitespace from result", () => {
    expect(lines("  A  ", "  B  ")).toBe("A  \n\n  B");
  });
});

// ---------------------------------------------------------------------------
// section()
// ---------------------------------------------------------------------------

describe("section", () => {
  it("creates a markdown section with string content", () => {
    expect(section("Context", "You are a helpful assistant.")).toBe(
      "## Context\n\nYou are a helpful assistant.",
    );
  });

  it("creates a bullet list from string array", () => {
    expect(section("Tasks", ["Task 1", "Task 2", "Task 3"])).toBe(
      "## Tasks\n\n- Task 1\n- Task 2\n- Task 3",
    );
  });

  it("handles single-item arrays", () => {
    expect(section("Note", ["Only one item"])).toBe(
      "## Note\n\n- Only one item",
    );
  });

  it("handles empty arrays", () => {
    expect(section("Empty", [])).toBe("## Empty\n\n");
  });
});

// ---------------------------------------------------------------------------
// when()
// ---------------------------------------------------------------------------

describe("when", () => {
  it("returns content when condition is truthy", () => {
    expect(when(true, "visible")).toBe("visible");
    expect(when(1, "visible")).toBe("visible");
    expect(when("yes", "visible")).toBe("visible");
    expect(when([], "visible")).toBe("visible");
  });

  it("returns empty string when condition is falsy", () => {
    expect(when(false, "hidden")).toBe("");
    expect(when(null, "hidden")).toBe("");
    expect(when(undefined, "hidden")).toBe("");
    expect(when(0, "hidden")).toBe("");
    expect(when("", "hidden")).toBe("");
  });

  it("returns elseContent when condition is falsy and elseContent is given", () => {
    expect(when(false, "yes", "no")).toBe("no");
  });

  it("accepts a function for lazy content evaluation", () => {
    let called = false;
    when(false, () => {
      called = true;
      return "lazy";
    });
    expect(called).toBe(false);

    expect(when(true, () => "lazy-value")).toBe("lazy-value");
  });

  it("accepts a function for lazy elseContent evaluation", () => {
    let called = false;
    when(true, "yes", () => {
      called = true;
      return "no";
    });
    expect(called).toBe(false);

    expect(when(false, "yes", () => "lazy-else")).toBe("lazy-else");
  });
});

// ---------------------------------------------------------------------------
// each()
// ---------------------------------------------------------------------------

describe("each", () => {
  it("maps items and joins with newline by default", () => {
    expect(each(["a", "b", "c"], (x) => `- ${x}`)).toBe("- a\n- b\n- c");
  });

  it("passes index to the map function", () => {
    expect(each(["a", "b"], (x, i) => `${i + 1}. ${x}`)).toBe("1. a\n2. b");
  });

  it("uses custom separator", () => {
    expect(each(["ts", "react", "next"], (x) => x, ", ")).toBe(
      "ts, react, next",
    );
  });

  it("returns empty string for empty array", () => {
    expect(each([], (x) => `${x}`)).toBe("");
  });

  it("works with object arrays", () => {
    const docs = [
      { label: "README", value: "docs" },
      { label: "SPEC", value: "spec" },
    ];
    expect(each(docs, (d) => `**${d.label}**: ${d.value}`)).toBe(
      "**README**: docs\n**SPEC**: spec",
    );
  });
});

// ---------------------------------------------------------------------------
// prompt()
// ---------------------------------------------------------------------------

describe("prompt", () => {
  it("creates a reusable function from a render callback", () => {
    const greet = prompt<{ name: string }>((v) => `Hello, ${v.name}!`);
    expect(greet({ name: "Alice" })).toBe("Hello, Alice!");
    expect(greet({ name: "Bob" })).toBe("Hello, Bob!");
  });

  it("composes with all other helpers", () => {
    const p = prompt<{
      role: string;
      tasks: string[];
      extra?: string;
    }>((v) =>
      lines(
        section("Role", v.role),
        section("Tasks", v.tasks),
        when(v.extra, () => section("Extra", v.extra!)),
      ),
    );

    const result = p({
      role: "Assistant",
      tasks: ["Help users", "Be accurate"],
      extra: "Some extra context",
    });

    expect(result).toContain("## Role\n\nAssistant");
    expect(result).toContain("## Tasks\n\n- Help users\n- Be accurate");
    expect(result).toContain("## Extra\n\nSome extra context");
  });

  it("filters out empty conditional sections", () => {
    const p = prompt<{ extra?: string }>((v) =>
      lines(
        "Base content.",
        when(v.extra, () => `Extra: ${v.extra}`),
      ),
    );

    expect(p({})).toBe("Base content.");
    expect(p({ extra: "yes" })).toBe("Base content.\n\nExtra: yes");
  });
});

// ---------------------------------------------------------------------------
// Composition -- real-world patterns
// ---------------------------------------------------------------------------

describe("composition", () => {
  it("builds a full system prompt from sub-blocks", () => {
    type PersonalizationVars = {
      personality?: string;
      nickname?: string;
    };

    const personalization = prompt<PersonalizationVars>((v) =>
      lines(
        when(v.personality, `Default personality: ${v.personality}`),
        when(v.nickname, `User nickname: ${v.nickname}`),
      ),
    );

    type AgentVars = {
      personalization: PersonalizationVars;
      documents: Array<{ label: string; value: string }>;
    };

    const agent = prompt<AgentVars>((v) =>
      lines(
        section("Identity", "You are Sentinel."),
        personalization(v.personalization),
        when(v.documents.length > 0, () =>
          section(
            "Documents",
            each(v.documents, (d) => `- **${d.label}**: ${d.value}`),
          ),
        ),
      ),
    );

    const full = agent({
      personalization: { personality: "friendly", nickname: "Mo" },
      documents: [{ label: "README", value: "Project docs" }],
    });

    expect(full).toContain("## Identity\n\nYou are Sentinel.");
    expect(full).toContain("Default personality: friendly");
    expect(full).toContain("User nickname: Mo");
    expect(full).toContain("## Documents");
    expect(full).toContain("- **README**: Project docs");
  });

  it("omits entire conditional blocks cleanly", () => {
    const result = lines(
      section("Always", "This is always here."),
      when(false, section("Hidden", "Should not appear.")),
      section("Also Always", "This too."),
    );

    expect(result).not.toContain("Hidden");
    expect(result).toContain("## Always");
    expect(result).toContain("## Also Always");
    const sectionCount = (result.match(/^## /gm) ?? []).length;
    expect(sectionCount).toBe(2);
  });

  it("handles nested each inside when inside section", () => {
    const memory = ["Prefers TypeScript", "Uses Vim"];
    const result = when(memory.length > 0, () =>
      section(
        "Memory",
        each(memory, (m) => `- ${m}`),
      ),
    );
    expect(result).toBe("## Memory\n\n- Prefers TypeScript\n- Uses Vim");
  });
});

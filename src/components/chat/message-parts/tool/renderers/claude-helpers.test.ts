import { describe, expect, it } from "bun:test";

import {
  extractTextFromContent,
  getApprovalReason,
  tryParseClaudeOutput,
} from "./claude-helpers";

describe("extractTextFromContent", () => {
  it("returns raw string output unchanged", () => {
    expect(
      extractTextFromContent(
        "total 0\ndrwxr-xr-x@  4 mohamedachaq  staff   128 Mar 21 21:42 .",
      ),
    ).toBe("total 0\ndrwxr-xr-x@  4 mohamedachaq  staff   128 Mar 21 21:42 .");
  });

  it("extracts stdout from structured objects", () => {
    expect(
      extractTextFromContent({
        stderr: "",
        stdout: "total 0",
      }),
    ).toBe("total 0");
  });
});

describe("getApprovalReason", () => {
  it("extracts reason from approval object", () => {
    expect(getApprovalReason({ id: "abc", reason: "File write" })).toBe(
      "File write",
    );
  });

  it("returns undefined when no reason", () => {
    expect(getApprovalReason({ id: "abc" })).toBeUndefined();
  });

  it("returns undefined for null/undefined", () => {
    expect(getApprovalReason(null)).toBeUndefined();
    expect(getApprovalReason(undefined)).toBeUndefined();
  });
});

describe("tryParseClaudeOutput", () => {
  type SearchOutput = { query: string; results: unknown[] };
  const isSearchOutput = (v: unknown): v is SearchOutput =>
    Boolean(v) &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).query === "string" &&
    Array.isArray((v as Record<string, unknown>).results);

  it("returns direct match when output already matches guard", () => {
    const output = { query: "test", results: [{ title: "a", url: "b" }] };
    expect(tryParseClaudeOutput(output, isSearchOutput)).toEqual(output);
  });

  it("parses JSON from stdout-wrapped text output", () => {
    const json = JSON.stringify({ query: "test", results: [] });
    const output = { stdout: json };
    const result = tryParseClaudeOutput(output, isSearchOutput);
    expect(result).toEqual({ query: "test", results: [] });
  });

  it("parses JSON from a raw string output", () => {
    const json = JSON.stringify({ query: "hello", results: [1] });
    const result = tryParseClaudeOutput(json, isSearchOutput);
    expect(result).toEqual({ query: "hello", results: [1] });
  });

  it("returns null when JSON does not match guard", () => {
    const json = JSON.stringify({ foo: "bar" });
    expect(tryParseClaudeOutput({ stdout: json }, isSearchOutput)).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    expect(
      tryParseClaudeOutput({ stdout: "hello world" }, isSearchOutput),
    ).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(tryParseClaudeOutput(null, isSearchOutput)).toBeNull();
    expect(tryParseClaudeOutput(undefined, isSearchOutput)).toBeNull();
  });
});

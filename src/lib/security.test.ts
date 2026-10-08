import { describe, expect, it } from "bun:test";

import { PERMISSION_MODES } from "@/server/db/enums";

import {
  BUILTIN_PERMISSION_MODES,
  PERMISSION_MODE_OPTIONS,
  getPermissionModeLabel,
  getPermissionModeOptions,
  resolveBuiltinPermissionMode,
  resolveSupportedPermissionMode,
} from "./security";

describe("permission modes", () => {
  it("lists one option per stored mode, least permissive first", () => {
    expect(PERMISSION_MODE_OPTIONS.map((option) => option.value)).toEqual([
      ...PERMISSION_MODES,
    ]);
    expect(getPermissionModeLabel("accept_edits")).toBe("Accept edits");
  });

  it("offers only the modes an engine supports", () => {
    expect(
      getPermissionModeOptions(BUILTIN_PERMISSION_MODES).map(
        (option) => option.value,
      ),
    ).toEqual(["default", "full"]);
    expect(
      getPermissionModeOptions(["full", "auto", "default"]).map(
        (option) => option.value,
      ),
    ).toEqual(["default", "auto", "full"]);
  });

  it("keeps supported modes as they are", () => {
    expect(resolveSupportedPermissionMode("auto", ["default", "auto"])).toBe(
      "auto",
    );
    expect(resolveBuiltinPermissionMode("full")).toBe("full");
    expect(resolveBuiltinPermissionMode("default")).toBe("default");
  });

  it("never grants more than the stored mode on engines without it", () => {
    expect(resolveBuiltinPermissionMode("accept_edits")).toBe("default");
    expect(resolveBuiltinPermissionMode("auto")).toBe("default");
    expect(
      resolveSupportedPermissionMode("full", ["default", "accept_edits"]),
    ).toBe("accept_edits");
    expect(
      resolveSupportedPermissionMode("auto", [
        "default",
        "accept_edits",
        "full",
      ]),
    ).toBe("accept_edits");
  });

  it("falls back to the least permissive supported mode", () => {
    expect(resolveBuiltinPermissionMode(null)).toBe("default");
    expect(resolveBuiltinPermissionMode(undefined)).toBe("default");
    expect(resolveSupportedPermissionMode("default", ["full", "auto"])).toBe(
      "auto",
    );
    expect(resolveBuiltinPermissionMode("unknown" as never)).toBe("default");
  });
});

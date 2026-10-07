import { describe, expect, it } from "bun:test";

import { BUILTIN_DRIVER_KINDS } from "@/lib/ai/chat/engines/catalog";

import {
  ENGINE_CLIENT_DESCRIPTORS,
  getEngineClientDescriptor,
  isTrustedEngineIconUrl,
} from "./descriptors";

describe("engine client descriptors", () => {
  it("describe every driver kind the catalog knows", () => {
    expect(Object.keys(ENGINE_CLIENT_DESCRIPTORS).sort()).toEqual(
      [...BUILTIN_DRIVER_KINDS].sort(),
    );
    for (const kind of BUILTIN_DRIVER_KINDS) {
      expect(ENGINE_CLIENT_DESCRIPTORS[kind].kind).toBe(kind);
    }
  });

  it("fall back to a generic descriptor for unknown kinds", () => {
    const descriptor = getEngineClientDescriptor("gemini");
    expect(descriptor.kind).toBe("gemini");
    expect(descriptor.rendererFamily).toBeNull();
    expect(descriptor.Icon).toBe(getEngineClientDescriptor(null).Icon);
    expect(getEngineClientDescriptor("__proto__").rendererFamily).toBeNull();
  });

  it("trust only registry CDN icons", () => {
    expect(
      isTrustedEngineIconUrl(
        "https://cdn.agentclientprotocol.com/registry/v1/latest/devin.svg",
      ),
    ).toBe(true);
    expect(
      isTrustedEngineIconUrl("https://example.com/registry/v1/latest/x.svg"),
    ).toBe(false);
    expect(
      isTrustedEngineIconUrl(
        "https://cdn.agentclientprotocol.com/registry/v1/latest/../x.svg",
      ),
    ).toBe(false);
    expect(isTrustedEngineIconUrl(null)).toBe(false);
  });
});

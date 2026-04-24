import { describe, expect, it } from "bun:test";

import { hasCuratedSkillIcon, isSafeSkillIconName } from "./skill-icon";

describe("skill icons", () => {
  it("detects curated skill icons", () => {
    expect(hasCuratedSkillIcon("figma-implement-design")).toBe(true);
    expect(hasCuratedSkillIcon("unknown-skill")).toBe(false);
  });

  it("allows safe Iconify metadata icon names only", () => {
    expect(isSafeSkillIconName("logos:figma")).toBe(true);
    expect(isSafeSkillIconName("simple-icons:openai")).toBe(true);
    expect(isSafeSkillIconName("https://example.test/icon.svg")).toBe(false);
    expect(isSafeSkillIconName("<svg/onload=alert(1)>")).toBe(false);
  });
});

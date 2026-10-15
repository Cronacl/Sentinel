import { afterAll, describe, expect, it } from "bun:test";

import {
  start,
  type OpenCodeFake,
} from "../../../../../../scripts/fixtures/agents/opencode/fake-server";
import { openCodeBasicAuth } from "../../../../../../scripts/fixtures/agents/opencode/scenario";
import { classifyOpenCodeVersion, probeOpenCodeServer } from "./version";

const fakes: OpenCodeFake[] = [];

afterAll(async () => {
  await Promise.all(fakes.map((fake) => fake.stop()));
});

describe("classifyOpenCodeVersion", () => {
  it("reads both generations' --version output", () => {
    expect(classifyOpenCodeVersion("1.18.32\n")).toEqual({
      generation: "v1",
      version: "1.18.32",
    });
    expect(classifyOpenCodeVersion("opencode v2.0.18")).toEqual({
      generation: "v2",
      version: "2.0.18",
    });
    expect(classifyOpenCodeVersion("0.0.0-dev-202610062254")).toBeNull();
    expect(classifyOpenCodeVersion(null)).toBeNull();
  });
});

describe("probeOpenCodeServer", () => {
  it("tells the generations apart over HTTP, ignoring the other's HTML", async () => {
    const v1 = await start({ generation: 1, password: "pw1" });
    const v2 = await start({
      generation: 2,
      password: "pw2",
      scenario: { version: "2.0.24" },
    });
    fakes.push(v1, v2);

    expect(
      await probeOpenCodeServer({
        authorization: openCodeBasicAuth("pw1"),
        baseUrl: v1.url,
      }),
    ).toEqual({ generation: "v1", version: "1.18.32" });
    expect(
      await probeOpenCodeServer({
        authorization: openCodeBasicAuth("pw2"),
        baseUrl: v2.url,
      }),
    ).toEqual({ generation: "v2", version: "2.0.24" });
  });

  it("reports a wrong password as unauthorized, not as a version", async () => {
    const v2 = await start({ generation: 2, password: "right" });
    fakes.push(v2);
    expect(
      await probeOpenCodeServer({
        authorization: openCodeBasicAuth("wrong"),
        baseUrl: v2.url,
      }),
    ).toBe("unauthorized");
  });

  it("returns null when nothing answers", async () => {
    expect(
      await probeOpenCodeServer({
        authorization: null,
        baseUrl: "http://127.0.0.1:1",
        timeoutMs: 200,
      }),
    ).toBeNull();
  });
});

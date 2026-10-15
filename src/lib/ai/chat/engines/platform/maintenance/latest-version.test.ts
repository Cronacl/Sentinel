import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  createLatestVersionLookup,
  LATEST_VERSION_FAILURE_TTL_MS,
  LATEST_VERSION_TTL_MS,
  npmLatestUrl,
  parseHomebrewLatestVersion,
} = await import("./latest-version");

function harness(responses: Array<() => Response | Promise<Response>>) {
  let now = 1_000_000;
  const urls: string[] = [];
  const fetch = mock(async (url: string) => {
    urls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("offline");
    return await next();
  });
  const lookup = createLatestVersionLookup({
    clock: { now: () => now },
    fetch,
  });
  return {
    advance: (ms: number) => {
      now += ms;
    },
    fetch,
    lookup,
    urls,
  };
}

const npm = { kind: "npm" as const, packageName: "@openai/codex" };
const json = (body: unknown) => () =>
  new Response(JSON.stringify(body), { status: 200 });

describe("latest version lookup", () => {
  it("reads the npm registry's latest for scoped packages", async () => {
    const { lookup, urls } = harness([json({ version: "0.161.0" })]);

    expect(await lookup.get(npm)).toEqual({
      checkedAt: 1_000_000,
      version: "0.161.0",
    });
    expect(urls).toEqual(["https://registry.npmjs.org/@openai%2Fcodex/latest"]);
    expect(npmLatestUrl("opencode-ai")).toBe(
      "https://registry.npmjs.org/opencode-ai/latest",
    );
  });

  it("caches an answer for an hour and shares concurrent lookups", async () => {
    const { advance, fetch, lookup } = harness([
      json({ version: "1.0.0" }),
      json({ version: "1.0.1" }),
    ]);

    await Promise.all([lookup.get(npm), lookup.get(npm), lookup.get(npm)]);
    advance(LATEST_VERSION_TTL_MS - 1);
    expect((await lookup.get(npm)).version).toBe("1.0.0");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lookup.peek(npm)?.fresh).toBe(true);

    advance(2);
    expect(lookup.peek(npm)).toEqual(
      expect.objectContaining({ fresh: false, version: "1.0.0" }),
    );
    expect((await lookup.get(npm)).version).toBe("1.0.1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the last answer after a failure and waits before retrying", async () => {
    const { advance, fetch, lookup } = harness([
      json({ version: "1.0.0" }),
      () => new Response("down", { status: 503 }),
      json({ version: "1.0.2" }),
    ]);

    await lookup.get(npm);
    advance(LATEST_VERSION_TTL_MS + 1);
    const failed = await lookup.get(npm);
    expect(failed.version).toBe("1.0.0");
    expect(failed.failedAt).toBeDefined();

    advance(LATEST_VERSION_FAILURE_TTL_MS - 1);
    await lookup.get(npm);
    expect(fetch).toHaveBeenCalledTimes(2);

    advance(2);
    expect((await lookup.get(npm)).version).toBe("1.0.2");
  });

  it("forces a lookup and survives invalid payloads", async () => {
    const { fetch, lookup } = harness([
      json({ version: "1.0.0" }),
      json({ nope: true }),
    ]);
    await lookup.get(npm);
    const forced = await lookup.get(npm, { force: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(forced.version).toBe("1.0.0");
  });

  it("asks Homebrew for casks and formulae", async () => {
    const brewInfo = mock(async () => "1.0.40");
    const lookup = createLatestVersionLookup({ brewInfo });
    const source = {
      brewPath: "/opt/homebrew/bin/brew",
      cask: true,
      env: {},
      kind: "homebrew" as const,
      name: "copilot-cli",
    };
    expect((await lookup.get(source)).version).toBe("1.0.40");
    expect(brewInfo).toHaveBeenCalledWith(source);
  });
});

describe("parseHomebrewLatestVersion", () => {
  it("reads casks (dropping a build suffix) and formula stables", () => {
    expect(
      parseHomebrewLatestVersion(
        JSON.stringify({
          casks: [{ token: "copilot-cli", version: "1.0.40,123" }],
        }),
        true,
      ),
    ).toBe("1.0.40");
    expect(
      parseHomebrewLatestVersion(
        JSON.stringify({ formulae: [{ versions: { stable: "0.161.0" } }] }),
        false,
      ),
    ).toBe("0.161.0");
    expect(parseHomebrewLatestVersion("not json", true)).toBe(null);
    expect(parseHomebrewLatestVersion("{}", false)).toBe(null);
  });
});

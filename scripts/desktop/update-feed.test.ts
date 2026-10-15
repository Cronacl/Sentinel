import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import {
  darwinVersionForMacOS,
  findMacAppBundles,
  findMacUpdateFeedIssues,
  readFeedMinimumSystemVersion,
  readMacMinimumSystemVersion,
  setFeedMinimumSystemVersion,
  stampMacUpdateFeeds,
} from "./update-feed.mjs";

// Parse and compare with the same packages electron-updater uses for its
// minimumSystemVersion check (AppUpdater.checkIfUpdateSupported).
const updaterRequire = createRequire(
  createRequire(import.meta.url).resolve("electron-updater"),
);
const yaml = updaterRequire("js-yaml") as { load: (text: string) => unknown };
const semver = updaterRequire("semver") as {
  lt: (left: string, right: string) => boolean;
};

const FEED = `version: 0.0.67
files:
  - url: Sentinel-0.0.67-arm64.zip
    sha512: abc==
    size: 158940534
  - url: Sentinel-0.0.67-arm64.dmg
    sha512: def==
    size: 162744907
path: Sentinel-0.0.67-arm64.zip
sha512: abc==
releaseDate: '2026-10-07T10:06:48.300Z'
`;

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleName</key>
    <string>Sentinel</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
  </dict>
</plist>
`;

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("darwinVersionForMacOS", () => {
  it("maps whole-major macOS floors to their first Darwin kernel", () => {
    expect(darwinVersionForMacOS("13.0")).toBe("22.0.0");
    expect(darwinVersionForMacOS("13")).toBe("22.0.0");
    expect(darwinVersionForMacOS("14.0.0")).toBe("23.0.0");
  });

  it("refuses floors it cannot map exactly", () => {
    expect(() => darwinVersionForMacOS("13.3")).toThrow(
      "DARWIN_VERSION_BY_MACOS_MAJOR",
    );
    expect(() => darwinVersionForMacOS("27.0")).toThrow(
      "DARWIN_VERSION_BY_MACOS_MAJOR",
    );
  });
});

describe("update feed minimumSystemVersion", () => {
  it("reads LSMinimumSystemVersion from an XML Info.plist", () => {
    expect(readMacMinimumSystemVersion(INFO_PLIST)).toBe("13.0");
    expect(readMacMinimumSystemVersion("<plist><dict/></plist>")).toBeNull();
  });

  it("adds the field once and replaces it on later runs", () => {
    const stamped = setFeedMinimumSystemVersion(FEED, "22.0.0");
    expect(stamped).toBe(`${FEED}minimumSystemVersion: 22.0.0\n`);
    expect(setFeedMinimumSystemVersion(stamped, "22.0.0")).toBe(stamped);
    expect(
      readFeedMinimumSystemVersion(
        setFeedMinimumSystemVersion(stamped, "23.0.0"),
      ),
    ).toBe("23.0.0");
  });

  it("stops electron-updater on macOS 12 and lets macOS 13 through", () => {
    const info = yaml.load(setFeedMinimumSystemVersion(FEED, "22.0.0")) as {
      minimumSystemVersion: string;
      version: string;
    };

    expect(info.version).toBe("0.0.67");
    expect(info.minimumSystemVersion).toBe("22.0.0");
    // os.release() on macOS 12.7 and 13.0.
    expect(semver.lt("21.6.0", info.minimumSystemVersion)).toBe(true);
    expect(semver.lt("22.1.0", info.minimumSystemVersion)).toBe(false);
  });

  it("reports feeds that are missing or disagree with the app floor", () => {
    expect(
      findMacUpdateFeedIssues({ feeds: [], macosVersion: "13.0" }),
    ).toEqual(["no macOS update feed (*-mac.yml) was written"]);
    expect(
      findMacUpdateFeedIssues({
        feeds: [
          { content: FEED, file: "latest-mac.yml" },
          {
            content: setFeedMinimumSystemVersion(FEED, "21.0.0"),
            file: "beta-mac.yml",
          },
          {
            content: setFeedMinimumSystemVersion(FEED, "22.0.0"),
            file: "alpha-mac.yml",
          },
        ],
        macosVersion: "13.0",
      }),
    ).toEqual([
      "latest-mac.yml: minimumSystemVersion is missing, expected 22.0.0 (macOS 13.0)",
      "beta-mac.yml: minimumSystemVersion is 21.0.0, expected 22.0.0 (macOS 13.0)",
    ]);
  });
});

describe("stampMacUpdateFeeds", () => {
  it("copies the packaged app floor into the dist feeds", async () => {
    const distRoot = await mkdtemp(path.join(os.tmpdir(), "update-feed-"));
    tempRoots.push(distRoot);
    const contentsPath = path.join(
      distRoot,
      "mac-arm64",
      "Sentinel.app",
      "Contents",
    );
    await mkdir(contentsPath, { recursive: true });
    await writeFile(path.join(contentsPath, "Info.plist"), INFO_PLIST);
    await writeFile(path.join(distRoot, "latest-mac.yml"), FEED);
    await writeFile(path.join(distRoot, "latest-linux.yml"), FEED);

    const appPaths = await findMacAppBundles(distRoot);
    expect(appPaths).toEqual([
      path.join(distRoot, "mac-arm64", "Sentinel.app"),
    ]);

    await expect(stampMacUpdateFeeds({ appPaths, distRoot })).resolves.toEqual({
      darwinVersion: "22.0.0",
      macosVersion: "13.0",
    });
    expect(
      readFeedMinimumSystemVersion(
        await readFile(path.join(distRoot, "latest-mac.yml"), "utf8"),
      ),
    ).toBe("22.0.0");
    expect(
      await readFile(path.join(distRoot, "latest-linux.yml"), "utf8"),
    ).toBe(FEED);
  });

  it("fails when electron-builder wrote no macOS feed", async () => {
    const distRoot = await mkdtemp(path.join(os.tmpdir(), "update-feed-"));
    tempRoots.push(distRoot);
    const contentsPath = path.join(distRoot, "mac", "Sentinel.app", "Contents");
    await mkdir(contentsPath, { recursive: true });
    await writeFile(path.join(contentsPath, "Info.plist"), INFO_PLIST);

    await expect(
      stampMacUpdateFeeds({
        appPaths: await findMacAppBundles(distRoot),
        distRoot,
      }),
    ).rejects.toThrow("no *-mac.yml feed");
  });
});

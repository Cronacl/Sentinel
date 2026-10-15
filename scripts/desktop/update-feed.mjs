// electron-updater skips an update whose feed lists a minimumSystemVersion
// above os.release(), the Darwin kernel version. electron-builder only writes
// the macOS floor into Info.plist, so without this step a Mac below the floor
// downloads a build it cannot open.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Darwin kernel version of each macOS release's first build. Only whole-major
// floors are mapped; minor releases do not follow a fixed kernel offset.
const DARWIN_VERSION_BY_MACOS_MAJOR = new Map([
  [12, "21.0.0"],
  [13, "22.0.0"],
  [14, "23.0.0"],
  [15, "24.0.0"],
]);
const MINIMUM_SYSTEM_VERSION_LINE = /^minimumSystemVersion:.*$/m;

/**
 * @param {string} macosVersion LSMinimumSystemVersion, for example `13.0`.
 */
export function darwinVersionForMacOS(macosVersion) {
  const match = /^(\d+)(?:\.0){0,2}$/.exec(String(macosVersion).trim());
  const darwinVersion = match
    ? DARWIN_VERSION_BY_MACOS_MAJOR.get(Number(match[1]))
    : undefined;

  if (!darwinVersion) {
    throw new Error(
      `No Darwin kernel version is mapped for a macOS ${macosVersion} floor; add it to DARWIN_VERSION_BY_MACOS_MAJOR in scripts/desktop/update-feed.mjs.`,
    );
  }

  return darwinVersion;
}

/**
 * @param {string} infoPlist XML Info.plist contents.
 */
export function readMacMinimumSystemVersion(infoPlist) {
  const match =
    /<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/.exec(
      infoPlist,
    );
  return match?.[1]?.trim() ?? null;
}

/**
 * @param {string} feed update feed YAML, for example `latest-mac.yml`.
 */
export function readFeedMinimumSystemVersion(feed) {
  const match = /^minimumSystemVersion:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(feed);
  return match?.[1] ?? null;
}

/**
 * @param {string} feed
 * @param {string} darwinVersion
 */
export function setFeedMinimumSystemVersion(feed, darwinVersion) {
  const line = `minimumSystemVersion: ${darwinVersion}`;

  if (MINIMUM_SYSTEM_VERSION_LINE.test(feed)) {
    return feed.replace(MINIMUM_SYSTEM_VERSION_LINE, line);
  }

  return `${feed.trimEnd()}\n${line}\n`;
}

/**
 * @param {{
 *   feeds: { file: string; content: string }[];
 *   macosVersion: string;
 * }} input
 */
export function findMacUpdateFeedIssues({ feeds, macosVersion }) {
  if (feeds.length === 0) {
    return ["no macOS update feed (*-mac.yml) was written"];
  }

  const expected = darwinVersionForMacOS(macosVersion);

  return feeds.flatMap(({ content, file }) => {
    const actual = readFeedMinimumSystemVersion(content);
    return actual === expected
      ? []
      : [
          `${file}: minimumSystemVersion is ${actual ?? "missing"}, expected ${expected} (macOS ${macosVersion})`,
        ];
  });
}

/**
 * @param {string} distRoot
 */
export async function readMacUpdateFeeds(distRoot) {
  const entries = await readdir(distRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith("-mac.yml"))
    .map((entry) => path.join(distRoot, entry.name))
    .sort();

  return Promise.all(
    files.map(async (file) => ({
      content: await readFile(file, "utf8"),
      file,
    })),
  );
}

/**
 * @param {string} appPath packaged `.app` bundle.
 */
export async function readAppMinimumSystemVersion(appPath) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const macosVersion = readMacMinimumSystemVersion(
    await readFile(infoPlistPath, "utf8"),
  );

  if (!macosVersion) {
    throw new Error(`${infoPlistPath} has no LSMinimumSystemVersion.`);
  }

  return macosVersion;
}

/**
 * electron-builder writes `.app` bundles to `dist/mac`, `dist/mac-arm64` or
 * `dist/mac-universal`.
 *
 * @param {string} distRoot
 */
export async function findMacAppBundles(distRoot) {
  const appPaths = [];

  for (const entry of await readdir(distRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;

    const bundleRoot = path.join(distRoot, entry.name);
    for (const child of await readdir(bundleRoot, { withFileTypes: true })) {
      if (child.isDirectory() && child.name.endsWith(".app")) {
        appPaths.push(path.join(bundleRoot, child.name));
      }
    }
  }

  return appPaths.sort();
}

/**
 * Copies the packaged app's macOS floor into every macOS update feed.
 *
 * @param {{ appPaths: string[]; distRoot: string }} input
 */
export async function stampMacUpdateFeeds({ appPaths, distRoot }) {
  const macosVersions = [
    ...new Set(await Promise.all(appPaths.map(readAppMinimumSystemVersion))),
  ];
  const [macosVersion] = macosVersions;

  if (!macosVersion || macosVersions.length !== 1) {
    throw new Error(
      `Expected one LSMinimumSystemVersion across ${appPaths.length} app bundle(s), found: ${macosVersions.join(", ") || "none"}.`,
    );
  }

  const darwinVersion = darwinVersionForMacOS(macosVersion);
  const feeds = await readMacUpdateFeeds(distRoot);

  if (feeds.length === 0) {
    throw new Error(`electron-builder wrote no *-mac.yml feed in ${distRoot}.`);
  }

  for (const { content, file } of feeds) {
    await writeFile(
      file,
      setFeedMinimumSystemVersion(content, darwinVersion),
      "utf8",
    );
    console.log(
      `[desktop] ${path.basename(file)}: minimumSystemVersion ${darwinVersion} (macOS ${macosVersion})`,
    );
  }

  return { darwinVersion, macosVersion };
}

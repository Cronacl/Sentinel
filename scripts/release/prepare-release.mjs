import { appendFile, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const RELEASE_LABELS = [
  "release:major",
  "release:minor",
  "release:patch",
  "release:skip",
];
const BUMP_ORDER = {
  "release:major": 3,
  "release:minor": 2,
  "release:patch": 1,
  "release:skip": 0,
};

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

function isAncestor(commitish, head = "HEAD") {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commitish, head], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function githubRequest(path) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is required.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "sentinel-prepare-release",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}) for ${path}: ${await response.text()}`,
    );
  }

  return response.json();
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-alpha\.\d+)?$/);

  if (!match) {
    throw new Error(
      `Unsupported package version "${version}". Expected semver with optional -alpha.N suffix.`,
    );
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function bumpAlphaVersion(version, bumpLabel) {
  const parsed = parseVersion(version);

  if (bumpLabel === "release:major") {
    return `${parsed.major + 1}.0.0-alpha.1`;
  }

  if (bumpLabel === "release:minor") {
    return `${parsed.major}.${parsed.minor + 1}.0-alpha.1`;
  }

  if (bumpLabel === "release:patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-alpha.1`;
  }

  throw new Error(`Cannot bump version for unsupported label "${bumpLabel}".`);
}

function groupPullRequestsByLabel(pullRequests) {
  const groups = new Map([
    ["release:major", []],
    ["release:minor", []],
    ["release:patch", []],
  ]);

  for (const pullRequest of pullRequests) {
    if (pullRequest.releaseLabel === "release:skip") {
      continue;
    }

    groups.get(pullRequest.releaseLabel).push(pullRequest);
  }

  return groups;
}

function extractReleaseNotesOverride(body) {
  if (typeof body !== "string" || !body.trim()) {
    return null;
  }

  const match = body.match(
    /(^|\n)##\s+Release Notes\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i,
  );

  if (!match?.[2]) {
    return null;
  }

  const lines = match[2]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(
      (line) =>
        line &&
        line !== "Write the changelog line you want if the PR title is not good enough.",
    );

  if (lines.length === 0) {
    return null;
  }

  return lines.join(" ");
}

function formatChangelogSection({ pullRequests, repositoryUrl, version }) {
  const date = new Date().toISOString().slice(0, 10);
  const groups = groupPullRequestsByLabel(pullRequests);
  const sections = [];
  const sectionTitles = {
    "release:major": "Major",
    "release:minor": "Minor",
    "release:patch": "Patch",
  };

  for (const label of ["release:major", "release:minor", "release:patch"]) {
    const entries = groups.get(label);
    if (!entries || entries.length === 0) {
      continue;
    }

    sections.push(`### ${sectionTitles[label]}`);
    sections.push("");

    for (const pullRequest of entries) {
      sections.push(
        `- ${pullRequest.changelogLine ?? pullRequest.title} ([#${pullRequest.number}](${repositoryUrl}/pull/${pullRequest.number}))`,
      );
    }

    sections.push("");
  }

  return [`## [${version}] - ${date}`, "", ...sections].join("\n").trimEnd();
}

function prependChangelog(existingChangelog, section) {
  if (!existingChangelog.trim()) {
    return `${section}\n`;
  }

  const marker =
    "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).";
  const markerIndex = existingChangelog.indexOf(marker);

  if (markerIndex === -1) {
    return `${section}\n\n${existingChangelog.trimStart()}\n`;
  }

  const insertAt = markerIndex + marker.length;
  const before = existingChangelog.slice(0, insertAt);
  const after = existingChangelog.slice(insertAt).trimStart();

  return `${before}\n\n${section}\n\n${after}`.trimEnd() + "\n";
}

async function writeGitHubOutput(output) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const lines = Object.entries(output).map(([key, value]) => `${key}=${value}`);
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

const repository = process.env.GITHUB_REPOSITORY;

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}

const baseBranch = process.env.BASE_BRANCH ?? "main";
const repositoryUrl = `https://github.com/${repository}`;
const [owner, repo] = repository.split("/");
const currentBranch = runGit(["branch", "--show-current"]);

if (currentBranch !== baseBranch) {
  throw new Error(
    `prepare-release must run on ${baseBranch}. Current branch is ${currentBranch}.`,
  );
}

const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
  await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
);
const currentVersion = packageJson.version;
const latestTag = tryRunGit([
  "describe",
  "--tags",
  "--abbrev=0",
  "--match",
  "v*",
]);

if (latestTag && latestTag !== `v${currentVersion}`) {
  throw new Error(
    `package.json version ${currentVersion} does not match the latest release tag ${latestTag}.`,
  );
}

const latestTagDate = latestTag
  ? runGit(["log", "-1", "--format=%cI", latestTag])
  : null;

const mergedPullRequests = [];

for (let page = 1; page <= 20; page += 1) {
  const pullRequests = await githubRequest(
    `/repos/${owner}/${repo}/pulls?state=closed&base=${encodeURIComponent(baseBranch)}&per_page=100&page=${page}&sort=updated&direction=desc`,
  );

  if (!Array.isArray(pullRequests) || pullRequests.length === 0) {
    break;
  }

  for (const pullRequest of pullRequests) {
    if (!pullRequest.merged_at) {
      continue;
    }

    if (latestTagDate && pullRequest.merged_at <= latestTagDate) {
      continue;
    }

    if (
      pullRequest.merge_commit_sha &&
      !isAncestor(pullRequest.merge_commit_sha)
    ) {
      continue;
    }

    mergedPullRequests.push(pullRequest);
  }

  if (pullRequests.length < 100) {
    break;
  }

  if (page === 20) {
    throw new Error(
      "prepare-release exceeded the pull request pagination limit. Increase the page limit in scripts/release/prepare-release.mjs.",
    );
  }
}

const uniquePullRequests = Array.from(
  new Map(
    mergedPullRequests.map((pullRequest) => [pullRequest.number, pullRequest]),
  ).values(),
).sort((left, right) => left.merged_at.localeCompare(right.merged_at));

if (uniquePullRequests.length === 0) {
  console.log(
    "[release] no merged pull requests found since the latest release tag.",
  );
  await writeGitHubOutput({
    release_created: "false",
  });
  process.exit(0);
}

const invalidPullRequests = [];

for (const pullRequest of uniquePullRequests) {
  const releaseLabels = (pullRequest.labels ?? [])
    .map((label) => label?.name)
    .filter(
      (name) => typeof name === "string" && RELEASE_LABELS.includes(name),
    );

  if (releaseLabels.length !== 1) {
    invalidPullRequests.push({
      labels: releaseLabels,
      number: pullRequest.number,
      title: pullRequest.title,
    });
    continue;
  }

  pullRequest.releaseLabel = releaseLabels[0];
  pullRequest.changelogLine =
    extractReleaseNotesOverride(pullRequest.body) ?? pullRequest.title;
}

if (invalidPullRequests.length > 0) {
  const details = invalidPullRequests
    .map(
      (pullRequest) =>
        `#${pullRequest.number} "${pullRequest.title}" (${pullRequest.labels.length === 0 ? "no release label" : pullRequest.labels.join(", ")})`,
    )
    .join("\n");

  throw new Error(
    `Every merged pull request must have exactly one release-impact label.\n${details}`,
  );
}

const releasablePullRequests = uniquePullRequests.filter(
  (pullRequest) => pullRequest.releaseLabel !== "release:skip",
);

if (releasablePullRequests.length === 0) {
  console.log(
    "[release] merged pull requests only contained release:skip labels. No release will be created.",
  );
  await writeGitHubOutput({
    release_created: "false",
  });
  process.exit(0);
}

const highestBump = releasablePullRequests.reduce((current, pullRequest) => {
  if (!current) {
    return pullRequest.releaseLabel;
  }

  return BUMP_ORDER[pullRequest.releaseLabel] > BUMP_ORDER[current]
    ? pullRequest.releaseLabel
    : current;
}, null);

const nextVersion = bumpAlphaVersion(currentVersion, highestBump);
const nextTag = `v${nextVersion}`;
const changelogPath = new URL("../../CHANGELOG.md", import.meta.url);
const existingChangelog = await readFile(changelogPath, "utf8");

if (existingChangelog.includes(`## [${nextVersion}]`)) {
  throw new Error(
    `CHANGELOG.md already contains a section for ${nextVersion}.`,
  );
}

packageJson.version = nextVersion;
packageLock.version = nextVersion;

if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = nextVersion;
}

const changelogSection = formatChangelogSection({
  pullRequests: releasablePullRequests,
  repositoryUrl,
  version: nextVersion,
});

await writeFile(
  new URL("../../package.json", import.meta.url),
  `${JSON.stringify(packageJson, null, 2)}\n`,
);
await writeFile(
  new URL("../../package-lock.json", import.meta.url),
  `${JSON.stringify(packageLock, null, 2)}\n`,
);
await writeFile(
  changelogPath,
  prependChangelog(existingChangelog, changelogSection),
);

console.log(
  `[release] prepared ${nextTag} from ${releasablePullRequests.length} merged pull request(s).`,
);

await writeGitHubOutput({
  release_created: "true",
  release_tag: nextTag,
  release_version: nextVersion,
});

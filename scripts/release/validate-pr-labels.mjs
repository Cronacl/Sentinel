import { readFile } from "node:fs/promises";

const RELEASE_LABELS = new Set([
  "release:major",
  "release:minor",
  "release:patch",
  "release:skip",
]);

const eventPath = process.env.GITHUB_EVENT_PATH;

if (!eventPath) {
  console.log(
    "[release] GITHUB_EVENT_PATH is not set, skipping PR label validation.",
  );
  process.exit(0);
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
const pullRequest = event.pull_request;

if (!pullRequest) {
  console.log(
    "[release] not a pull_request event, skipping PR label validation.",
  );
  process.exit(0);
}

const matchingLabels = (pullRequest.labels ?? [])
  .map((label) => label?.name)
  .filter((name) => typeof name === "string" && RELEASE_LABELS.has(name));

if (matchingLabels.length !== 1) {
  throw new Error(
    `Pull request #${pullRequest.number} must have exactly one release-impact label. Found: ${matchingLabels.length === 0 ? "none" : matchingLabels.join(", ")}.`,
  );
}

console.log(
  `[release] pull request #${pullRequest.number} uses ${matchingLabels[0]}.`,
);

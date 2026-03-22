import { readFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const labels = JSON.parse(
  await readFile(
    new URL("../../.github/release-labels.json", import.meta.url),
    "utf8",
  ),
);

async function githubRequest(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "sentinel-release-label-sync",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}) for ${path}: ${await response.text()}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

const [owner, repo] = repository.split("/");
const existingLabels = await githubRequest(
  `/repos/${owner}/${repo}/labels?per_page=100`,
);
const existingByName = new Map(
  existingLabels.map((label) => [label.name, label]),
);

for (const label of labels) {
  const existing = existingByName.get(label.name);

  if (!existing) {
    await githubRequest(`/repos/${owner}/${repo}/labels`, {
      body: JSON.stringify(label),
      method: "POST",
    });
    console.log(`[release] created label ${label.name}`);
    continue;
  }

  if (
    existing.color?.toLowerCase() !== label.color.toLowerCase() ||
    (existing.description ?? "") !== label.description
  ) {
    await githubRequest(
      `/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`,
      {
        body: JSON.stringify(label),
        method: "PATCH",
      },
    );
    console.log(`[release] updated label ${label.name}`);
    continue;
  }

  console.log(`[release] label ${label.name} already up to date`);
}

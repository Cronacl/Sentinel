export type RegistrySkill = {
  name: string;
  displayName: string;
  description: string;
  repoUrl: string;
  skillPath: string;
  ref: string;
  installSteps: string[];
};

export function buildInstallSteps(
  repoUrl: string,
  skillPath: string,
  ref: string,
): string[] {
  const repoSlug = new URL(repoUrl).pathname
    .replace(/^\//, "")
    .replace(/\/$/, "");
  const repoName = repoSlug.split("/")[1];
  return [
    "_SKILL_TMP=$(mktemp -d)",
    `curl -sL "https://codeload.github.com/${repoSlug}/tar.gz/${ref}" | tar xz -C "$_SKILL_TMP"`,
    `cp -r "$_SKILL_TMP/${repoName}-${ref}/${skillPath}" "{{DEST}}"`,
    `rm -rf "$_SKILL_TMP"`,
  ];
}

export function findRegistrySkill(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    SKILL_REGISTRY.find(
      (entry) => entry.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

function anthropic(
  name: string,
  displayName: string,
  description: string,
): RegistrySkill {
  return {
    name,
    displayName,
    description,
    repoUrl: "https://github.com/anthropics/skills",
    skillPath: `skills/${name}`,
    ref: "main",
    installSteps: buildInstallSteps(
      "https://github.com/anthropics/skills",
      `skills/${name}`,
      "main",
    ),
  };
}

function openai(
  name: string,
  displayName: string,
  description: string,
): RegistrySkill {
  return {
    name,
    displayName,
    description,
    repoUrl: "https://github.com/openai/skills",
    skillPath: `skills/.curated/${name}`,
    ref: "main",
    installSteps: buildInstallSteps(
      "https://github.com/openai/skills",
      `skills/.curated/${name}`,
      "main",
    ),
  };
}

function remotion(
  name: string,
  displayName: string,
  description: string,
): RegistrySkill {
  return {
    name,
    displayName,
    description,
    repoUrl: "https://github.com/remotion-dev/skills",
    skillPath: `skills/${name}`,
    ref: "main",
    installSteps: buildInstallSteps(
      "https://github.com/remotion-dev/skills",
      `skills/${name}`,
      "main",
    ),
  };
}

function marketing(
  name: string,
  displayName: string,
  description: string,
): RegistrySkill {
  return {
    name,
    displayName,
    description,
    repoUrl: "https://github.com/coreyhaines31/marketingskills",
    skillPath: `skills/${name}`,
    ref: "main",
    installSteps: buildInstallSteps(
      "https://github.com/coreyhaines31/marketingskills",
      `skills/${name}`,
      "main",
    ),
  };
}

function playwright(
  name: string,
  displayName: string,
  description: string,
): RegistrySkill {
  return {
    name,
    displayName,
    description,
    repoUrl: "https://github.com/microsoft/playwright",
    skillPath: `.claude/skills/${name}`,
    ref: "main",
    installSteps: buildInstallSteps(
      "https://github.com/microsoft/playwright",
      `.claude/skills/${name}`,
      "main",
    ),
  };
}

export const SKILL_REGISTRY: RegistrySkill[] = [
  anthropic(
    "frontend-design",
    "Frontend Design",
    "Create distinctive, production-grade frontend interfaces with high design quality.",
  ),
  anthropic(
    "mcp-builder",
    "MCP Builder",
    "Guide for creating high-quality MCP servers that enable LLMs to interact with external services.",
  ),
  anthropic(
    "webapp-testing",
    "Web App Testing",
    "Toolkit for testing local web applications using Playwright.",
  ),
  anthropic(
    "doc-coauthoring",
    "Doc Co-authoring",
    "Structured workflow for co-authoring docs, proposals, technical specs, and decision documents.",
  ),

  openai(
    "cloudflare-deploy",
    "Cloudflare Deploy",
    "Deploy applications and infrastructure to Cloudflare using Workers, Pages, and related platform services.",
  ),
  openai(
    "figma-implement-design",
    "Figma Implement Design",
    "Turn Figma designs into production-ready code with 1:1 visual fidelity.",
  ),
  openai(
    "gh-fix-ci",
    "GitHub Fix CI",
    "Debug or fix failing GitHub PR checks that run in GitHub Actions.",
  ),
  openai(
    "gh-address-comments",
    "GH Address Comments",
    "Help address review and issue comments on the open GitHub PR for the current branch.",
  ),
  openai(
    "pdf",
    "PDF",
    "Read, create, or review PDFs where layout and rendering matter using Python tools.",
  ),
  openai(
    "doc",
    "Document",
    "Read, create, or edit .docx documents with formatting and layout fidelity.",
  ),
  openai(
    "slides",
    "Slides",
    "Create and edit presentation slide decks (.pptx) with PptxGenJS and layout helpers.",
  ),
  openai(
    "playwright",
    "Playwright",
    "Automate a real browser from the terminal via playwright-cli or a bundled wrapper script.",
  ),
  openai(
    "vercel-deploy",
    "Vercel Deploy",
    "Deploy applications and websites to Vercel.",
  ),

  remotion(
    "remotion",
    "Remotion",
    "Create and edit programmatic videos with React using the Remotion framework.",
  ),

  anthropic(
    "xlsx",
    "Excel (XLSX)",
    "Read, create, or edit Excel spreadsheets (.xlsx) with formatting and layout fidelity.",
  ),

  marketing(
    "copywriting",
    "Copywriting",
    "Write high-converting copy for landing pages, ads, emails, and sales assets.",
  ),
  marketing(
    "marketing-ideas",
    "Marketing Ideas",
    "Generate creative marketing strategies, campaign concepts, and growth ideas.",
  ),
  marketing(
    "lead-magnets",
    "Lead Magnets",
    "Create compelling lead magnets that attract and convert potential customers.",
  ),
  marketing(
    "cold-email",
    "Cold Email",
    "Craft effective cold email sequences that get opens, replies, and conversions.",
  ),
  marketing(
    "ad-creative",
    "Ad Creative",
    "Design and write high-performing ad creatives for paid channels.",
  ),
  marketing(
    "social-content",
    "Social Content",
    "Create engaging social media content across platforms to grow audience and reach.",
  ),
];

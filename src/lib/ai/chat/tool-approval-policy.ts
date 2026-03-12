export const TOOL_APPROVAL_TOOL_NAMES = [
  "list",
  "glob",
  "read",
  "grep",
  "edit",
  "multiedit",
  "create_file",
  "delete_file",
  "run_task",
  "shell_command",
  "websearch",
  "webfetch",
] as const;

export type ToolApprovalToolName = (typeof TOOL_APPROVAL_TOOL_NAMES)[number];

type ToolApprovalMetadata = {
  defaultRequireApproval: boolean;
  description: string;
  label: string;
  riskSummary: string;
};

export const TOOL_APPROVAL_METADATA: Record<
  ToolApprovalToolName,
  ToolApprovalMetadata
> = {
  list: {
    defaultRequireApproval: false,
    description: "List files and folders in a compact tree.",
    label: "List",
    riskSummary:
      "Sentinel can inspect directory trees in the selected project without stopping for confirmation.",
  },
  glob: {
    defaultRequireApproval: false,
    description: "Find files by glob pattern.",
    label: "Glob",
    riskSummary:
      "Sentinel can discover matching files in the selected project without stopping for confirmation.",
  },
  read: {
    defaultRequireApproval: false,
    description: "Read file contents or bounded slices.",
    label: "Read",
    riskSummary:
      "Sentinel can inspect file contents in the selected project without stopping for confirmation.",
  },
  grep: {
    defaultRequireApproval: false,
    description: "Search project content with ripgrep.",
    label: "Grep",
    riskSummary:
      "Sentinel can search code and text across the selected project without stopping for confirmation.",
  },
  edit: {
    defaultRequireApproval: true,
    description: "Replace exact text inside an existing file.",
    label: "Edit",
    riskSummary:
      "Sentinel can modify existing files without stopping for confirmation.",
  },
  multiedit: {
    defaultRequireApproval: true,
    description: "Apply multiple exact text replacements in one file.",
    label: "Multi edit",
    riskSummary:
      "Sentinel can apply several coordinated file edits without stopping for confirmation.",
  },
  create_file: {
    defaultRequireApproval: true,
    description: "Create a new file with full contents.",
    label: "Create file",
    riskSummary:
      "Sentinel can create new files in the project without stopping for confirmation.",
  },
  delete_file: {
    defaultRequireApproval: true,
    description: "Delete a file from the workspace.",
    label: "Delete file",
    riskSummary:
      "Sentinel can delete project files without stopping for confirmation.",
  },
  run_task: {
    defaultRequireApproval: true,
    description:
      "Run standard project scripts like test, lint, build, or typecheck.",
    label: "Run task",
    riskSummary:
      "Sentinel can run project scripts like test, build, or lint immediately.",
  },
  shell_command: {
    defaultRequireApproval: true,
    description: "Run a single shell command in the workspace.",
    label: "Shell command",
    riskSummary:
      "Sentinel can execute shell commands immediately in the workspace.",
  },
  websearch: {
    defaultRequireApproval: true,
    description: "Search the web for sources and summaries.",
    label: "Web search",
    riskSummary:
      "Sentinel can query remote search providers and retrieve external search results immediately.",
  },
  webfetch: {
    defaultRequireApproval: true,
    description: "Fetch web pages or images from a URL.",
    label: "Web fetch",
    riskSummary:
      "Sentinel can access remote URLs immediately, including user-shared documentation and external pages.",
  },
};

export type ToolApprovalPolicyMap = Record<ToolApprovalToolName, boolean>;

export type EffectiveToolApprovalPolicy = ToolApprovalMetadata & {
  isDefault: boolean;
  requireApproval: boolean;
  toolName: ToolApprovalToolName;
};

export type ToolApprovalOverrideRecord = {
  requireApproval: boolean;
  toolName: string;
};

const DEFAULT_TOOL_APPROVAL_POLICIES = Object.fromEntries(
  TOOL_APPROVAL_TOOL_NAMES.map((toolName) => [
    toolName,
    TOOL_APPROVAL_METADATA[toolName].defaultRequireApproval,
  ]),
) as ToolApprovalPolicyMap;

export function isToolApprovalToolName(
  value: string,
): value is ToolApprovalToolName {
  return TOOL_APPROVAL_TOOL_NAMES.includes(value as ToolApprovalToolName);
}

export function getDefaultToolApprovalPolicies(): ToolApprovalPolicyMap {
  return { ...DEFAULT_TOOL_APPROVAL_POLICIES };
}

export function getDefaultToolApproval(toolName: ToolApprovalToolName) {
  return TOOL_APPROVAL_METADATA[toolName].defaultRequireApproval;
}

export function buildToolApprovalOverrideMap(
  records: readonly ToolApprovalOverrideRecord[],
): Partial<ToolApprovalPolicyMap> {
  const overrides: Partial<ToolApprovalPolicyMap> = {};

  for (const record of records) {
    if (!isToolApprovalToolName(record.toolName)) {
      continue;
    }

    overrides[record.toolName] = Boolean(record.requireApproval);
  }

  return overrides;
}

export function resolveToolApprovalPolicies(
  overrides?: Partial<ToolApprovalPolicyMap>,
): ToolApprovalPolicyMap {
  return {
    ...DEFAULT_TOOL_APPROVAL_POLICIES,
    ...(overrides ?? {}),
  };
}

export function buildEffectiveToolApprovalPolicies(
  overrides?: Partial<ToolApprovalPolicyMap>,
): EffectiveToolApprovalPolicy[] {
  const effectivePolicies = resolveToolApprovalPolicies(overrides);

  return TOOL_APPROVAL_TOOL_NAMES.map((toolName) => {
    const metadata = TOOL_APPROVAL_METADATA[toolName];
    const requireApproval = effectivePolicies[toolName];

    return {
      ...metadata,
      isDefault: requireApproval === metadata.defaultRequireApproval,
      requireApproval,
      toolName,
    };
  });
}

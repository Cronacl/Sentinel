export const TOOL_APPROVAL_TOOL_NAMES = [
  "list",
  "glob",
  "read",
  "grep",
  "diff",
  "batch_read",
  "edit",
  "multiedit",
  "create_file",
  "delete_file",
  "move_file",
  "apply_patch",
  "run_task",
  "shell_command",
  "git",
  "diagnostics",
  "search_memory",
  "save_memory",
  "forget_memory",
  "websearch",
  "webfetch",
  "gmail_search",
  "gmail_get_email",
  "gmail_send",
  "gmail_reply",
  "gmail_create_draft",
  "gmail_list_labels",
  "gmail_manage_labels",
  "gmail_archive",
  "gmail_trash",
  "gmail_star",
  "gmail_unstar",
  "gmail_mark_read",
  "gmail_mark_unread",
  "gmail_forward",
  "gmail_get_thread",
  "gmail_bulk_action",
  "gcal_list_calendars",
  "gcal_get_events",
  "gcal_get_event",
  "gcal_create_event",
  "gcal_update_event",
  "gcal_delete_event",
  "gcal_get_free_busy",
  "gcal_quick_add",
  "gcal_rsvp",
  "gcal_move_event",
  "gcal_get_today",
  "gdrive_search",
  "gdrive_list_files",
  "gdrive_get_file",
  "gdrive_create_folder",
  "gdrive_upload",
  "gdrive_download",
  "gdrive_move",
  "gdrive_rename",
  "gdrive_trash",
  "gdrive_share",
  "gh_search_repos",
  "gh_list_repos",
  "gh_get_repo",
  "gh_list_issues",
  "gh_get_issue",
  "gh_create_issue",
  "gh_update_issue",
  "gh_close_issue",
  "gh_add_issue_comment",
  "gh_list_prs",
  "gh_get_pr",
  "gh_create_pr",
  "gh_merge_pr",
  "gh_review_pr",
  "gh_add_pr_comment",
  "gh_search_code",
  "gh_list_branches",
  "gh_create_branch",
  "gh_list_runs",
  "gh_get_run_logs",
  "gh_rerun_workflow",
  "gh_list_releases",
  "gh_create_release",
] as const;

export type ToolApprovalToolName = (typeof TOOL_APPROVAL_TOOL_NAMES)[number];

type ToolApprovalMetadata = {
  defaultRequireApproval: boolean;
  description: string;
  group?: string;
  label: string;
  riskSummary: string;
};

export type ToolApprovalGroup = {
  defaultRequireApproval: boolean;
  description: string;
  label: string;
  provider: string;
  riskSummary: string;
  toolNames: readonly string[];
};

export const TOOL_APPROVAL_GROUPS: Record<string, ToolApprovalGroup> = {
  gmail: {
    defaultRequireApproval: true,
    description:
      "Gmail tools for searching, reading, sending, and managing emails.",
    label: "Gmail",
    provider: "gmail",
    riskSummary:
      "Sentinel can search, read, send, and manage your Gmail emails.",
    toolNames: [
      "gmail_search",
      "gmail_get_email",
      "gmail_send",
      "gmail_reply",
      "gmail_create_draft",
      "gmail_list_labels",
      "gmail_manage_labels",
      "gmail_archive",
      "gmail_trash",
      "gmail_star",
      "gmail_unstar",
      "gmail_mark_read",
      "gmail_mark_unread",
      "gmail_forward",
      "gmail_get_thread",
      "gmail_bulk_action",
    ],
  },
  google_calendar: {
    defaultRequireApproval: true,
    description:
      "Google Calendar tools for viewing, creating, and managing events.",
    label: "Google Calendar",
    provider: "google_calendar",
    riskSummary:
      "Sentinel can view, create, update, and delete your Google Calendar events.",
    toolNames: [
      "gcal_list_calendars",
      "gcal_get_events",
      "gcal_get_event",
      "gcal_create_event",
      "gcal_update_event",
      "gcal_delete_event",
      "gcal_get_free_busy",
      "gcal_quick_add",
      "gcal_rsvp",
      "gcal_move_event",
      "gcal_get_today",
    ],
  },
  google_drive: {
    defaultRequireApproval: true,
    description:
      "Google Drive tools for searching, browsing, uploading, downloading, and managing files.",
    label: "Google Drive",
    provider: "google_drive",
    riskSummary:
      "Sentinel can search, browse, upload, download, and manage your Google Drive files.",
    toolNames: [
      "gdrive_search",
      "gdrive_list_files",
      "gdrive_get_file",
      "gdrive_create_folder",
      "gdrive_upload",
      "gdrive_download",
      "gdrive_move",
      "gdrive_rename",
      "gdrive_trash",
      "gdrive_share",
    ],
  },
  github: {
    defaultRequireApproval: true,
    description:
      "GitHub tools for searching repos, managing issues and PRs, browsing code, and running workflows.",
    label: "GitHub",
    provider: "github",
    riskSummary:
      "Sentinel can search repos, manage issues and PRs, create branches, trigger workflows, and create releases on your GitHub account.",
    toolNames: [
      "gh_search_repos",
      "gh_list_repos",
      "gh_get_repo",
      "gh_list_issues",
      "gh_get_issue",
      "gh_create_issue",
      "gh_update_issue",
      "gh_close_issue",
      "gh_add_issue_comment",
      "gh_list_prs",
      "gh_get_pr",
      "gh_create_pr",
      "gh_merge_pr",
      "gh_review_pr",
      "gh_add_pr_comment",
      "gh_search_code",
      "gh_list_branches",
      "gh_create_branch",
      "gh_list_runs",
      "gh_get_run_logs",
      "gh_rerun_workflow",
      "gh_list_releases",
      "gh_create_release",
    ],
  },
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
      "Sentinel can inspect directory trees in the selected project or discovered skill directories without stopping for confirmation.",
  },
  glob: {
    defaultRequireApproval: false,
    description: "Find files by glob pattern.",
    label: "Glob",
    riskSummary:
      "Sentinel can discover matching files in the selected project or discovered skill directories without stopping for confirmation.",
  },
  read: {
    defaultRequireApproval: false,
    description: "Read file contents or bounded slices.",
    label: "Read",
    riskSummary:
      "Sentinel can inspect file contents in the selected project or discovered skill directories without stopping for confirmation.",
  },
  grep: {
    defaultRequireApproval: false,
    description: "Search project content with ripgrep.",
    label: "Grep",
    riskSummary:
      "Sentinel can search code and text across the selected project or discovered skill directories without stopping for confirmation.",
  },
  diff: {
    defaultRequireApproval: false,
    description: "Generate unified diffs for files or proposed content.",
    label: "Diff",
    riskSummary:
      "Sentinel can inspect code changes as unified diffs without modifying files or pausing for confirmation.",
  },
  batch_read: {
    defaultRequireApproval: false,
    description: "Read multiple files or directories in one call.",
    label: "Batch read",
    riskSummary:
      "Sentinel can inspect several files or directories in the selected project or discovered skill directories without stopping for confirmation.",
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
  move_file: {
    defaultRequireApproval: true,
    description: "Rename or move a file within the workspace.",
    label: "Move file",
    riskSummary:
      "Sentinel can rename or relocate files in the project without stopping for confirmation.",
  },
  apply_patch: {
    defaultRequireApproval: true,
    description: "Apply a structured multi-file patch.",
    label: "Apply patch",
    riskSummary:
      "Sentinel can apply coordinated file additions, edits, deletions, and moves without stopping for confirmation.",
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
    description:
      "Run a single shell command in the workspace or a discovered skill directory.",
    label: "Shell command",
    riskSummary:
      "Sentinel can execute shell commands immediately in the workspace or discovered skill directories.",
  },
  git: {
    defaultRequireApproval: true,
    description: "Run safe structured git operations in the workspace.",
    label: "Git",
    riskSummary:
      "Sentinel can inspect or mutate local git state immediately within the selected repository.",
  },
  diagnostics: {
    defaultRequireApproval: true,
    description: "Collect structured lint or compiler diagnostics.",
    label: "Diagnostics",
    riskSummary:
      "Sentinel can run local code analysis tools immediately and surface structured diagnostics from the workspace.",
  },
  search_memory: {
    defaultRequireApproval: false,
    description:
      "Search long-term memory for relevant user or project context.",
    label: "Search memory",
    riskSummary:
      "Sentinel can recall previously stored memory immediately during conversation.",
  },
  save_memory: {
    defaultRequireApproval: false,
    description: "Store durable user or workspace context for future chats.",
    label: "Save memory",
    riskSummary:
      "Sentinel can save durable preferences, workflows, and project context without pausing.",
  },
  forget_memory: {
    defaultRequireApproval: false,
    description: "Delete a previously stored memory item.",
    label: "Forget memory",
    riskSummary:
      "Sentinel can remove previously stored memories immediately without pausing.",
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
  gmail_search: {
    defaultRequireApproval: false,
    description: "Search emails by query, label, or date.",
    group: "gmail",
    label: "Gmail search",
    riskSummary: "Sentinel can search your Gmail emails without stopping for confirmation.",
  },
  gmail_get_email: {
    defaultRequireApproval: false,
    description: "Get full email content by ID.",
    group: "gmail",
    label: "Gmail get email",
    riskSummary: "Sentinel can read your Gmail emails without stopping for confirmation.",
  },
  gmail_send: {
    defaultRequireApproval: true,
    description: "Send a new email.",
    group: "gmail",
    label: "Gmail send",
    riskSummary: "Sentinel can send emails from your Gmail account without stopping for confirmation.",
  },
  gmail_reply: {
    defaultRequireApproval: true,
    description: "Reply to an email thread.",
    group: "gmail",
    label: "Gmail reply",
    riskSummary: "Sentinel can reply to emails from your Gmail account without stopping for confirmation.",
  },
  gmail_create_draft: {
    defaultRequireApproval: true,
    description: "Create a draft email.",
    group: "gmail",
    label: "Gmail create draft",
    riskSummary: "Sentinel can create draft emails in your Gmail account without stopping for confirmation.",
  },
  gmail_list_labels: {
    defaultRequireApproval: false,
    description: "List Gmail labels.",
    group: "gmail",
    label: "Gmail list labels",
    riskSummary: "Sentinel can view your Gmail labels without stopping for confirmation.",
  },
  gmail_manage_labels: {
    defaultRequireApproval: true,
    description: "Add or remove labels from emails.",
    group: "gmail",
    label: "Gmail manage labels",
    riskSummary: "Sentinel can modify labels on your emails without stopping for confirmation.",
  },
  gmail_archive: {
    defaultRequireApproval: true,
    description: "Archive an email.",
    group: "gmail",
    label: "Gmail archive",
    riskSummary: "Sentinel can archive your emails without stopping for confirmation.",
  },
  gmail_trash: {
    defaultRequireApproval: true,
    description: "Move email to trash.",
    group: "gmail",
    label: "Gmail trash",
    riskSummary: "Sentinel can trash your emails without stopping for confirmation.",
  },
  gmail_star: {
    defaultRequireApproval: true,
    description: "Star an email.",
    group: "gmail",
    label: "Gmail star",
    riskSummary: "Sentinel can star your emails without stopping for confirmation.",
  },
  gmail_unstar: {
    defaultRequireApproval: true,
    description: "Remove star from an email.",
    group: "gmail",
    label: "Gmail unstar",
    riskSummary: "Sentinel can unstar your emails without stopping for confirmation.",
  },
  gmail_mark_read: {
    defaultRequireApproval: true,
    description: "Mark an email as read.",
    group: "gmail",
    label: "Gmail mark read",
    riskSummary: "Sentinel can mark your emails as read without stopping for confirmation.",
  },
  gmail_mark_unread: {
    defaultRequireApproval: true,
    description: "Mark an email as unread.",
    group: "gmail",
    label: "Gmail mark unread",
    riskSummary: "Sentinel can mark your emails as unread without stopping for confirmation.",
  },
  gmail_forward: {
    defaultRequireApproval: true,
    description: "Forward an email to another recipient.",
    group: "gmail",
    label: "Gmail forward",
    riskSummary: "Sentinel can forward your emails without stopping for confirmation.",
  },
  gmail_get_thread: {
    defaultRequireApproval: false,
    description: "Get all messages in an email thread.",
    group: "gmail",
    label: "Gmail get thread",
    riskSummary: "Sentinel can read email threads without stopping for confirmation.",
  },
  gmail_bulk_action: {
    defaultRequireApproval: true,
    description: "Perform bulk actions on multiple emails.",
    group: "gmail",
    label: "Gmail bulk action",
    riskSummary: "Sentinel can modify multiple emails at once without stopping for confirmation.",
  },
  gcal_list_calendars: {
    defaultRequireApproval: false,
    description: "List user's calendars.",
    group: "google_calendar",
    label: "Calendar list",
    riskSummary: "Sentinel can view your calendar list without stopping for confirmation.",
  },
  gcal_get_events: {
    defaultRequireApproval: false,
    description: "Get events in a date range.",
    group: "google_calendar",
    label: "Calendar get events",
    riskSummary: "Sentinel can view your calendar events without stopping for confirmation.",
  },
  gcal_get_event: {
    defaultRequireApproval: false,
    description: "Get a single event's details.",
    group: "google_calendar",
    label: "Calendar get event",
    riskSummary: "Sentinel can view event details without stopping for confirmation.",
  },
  gcal_create_event: {
    defaultRequireApproval: true,
    description: "Create a new event.",
    group: "google_calendar",
    label: "Calendar create event",
    riskSummary: "Sentinel can create events on your calendar without stopping for confirmation.",
  },
  gcal_update_event: {
    defaultRequireApproval: true,
    description: "Update an existing event.",
    group: "google_calendar",
    label: "Calendar update event",
    riskSummary: "Sentinel can modify your calendar events without stopping for confirmation.",
  },
  gcal_delete_event: {
    defaultRequireApproval: true,
    description: "Delete an event.",
    group: "google_calendar",
    label: "Calendar delete event",
    riskSummary: "Sentinel can delete your calendar events without stopping for confirmation.",
  },
  gcal_get_free_busy: {
    defaultRequireApproval: false,
    description: "Check free/busy status.",
    group: "google_calendar",
    label: "Calendar free/busy",
    riskSummary: "Sentinel can check your availability without stopping for confirmation.",
  },
  gcal_quick_add: {
    defaultRequireApproval: true,
    description: "Create event from natural language text.",
    group: "google_calendar",
    label: "Calendar quick add",
    riskSummary: "Sentinel can create calendar events from text without stopping for confirmation.",
  },
  gcal_rsvp: {
    defaultRequireApproval: true,
    description: "Respond to an event invitation.",
    group: "google_calendar",
    label: "Calendar RSVP",
    riskSummary: "Sentinel can respond to calendar invitations without stopping for confirmation.",
  },
  gcal_move_event: {
    defaultRequireApproval: true,
    description: "Move event between calendars.",
    group: "google_calendar",
    label: "Calendar move event",
    riskSummary: "Sentinel can move events between calendars without stopping for confirmation.",
  },
  gcal_get_today: {
    defaultRequireApproval: false,
    description: "Get today's calendar events.",
    group: "google_calendar",
    label: "Calendar today",
    riskSummary: "Sentinel can view today's events without stopping for confirmation.",
  },
  gdrive_search: {
    defaultRequireApproval: false,
    description: "Search files in Google Drive.",
    group: "google_drive",
    label: "Drive search",
    riskSummary: "Sentinel can search your Google Drive files without stopping for confirmation.",
  },
  gdrive_list_files: {
    defaultRequireApproval: false,
    description: "List files in a Google Drive folder.",
    group: "google_drive",
    label: "Drive list files",
    riskSummary: "Sentinel can browse your Google Drive folders without stopping for confirmation.",
  },
  gdrive_get_file: {
    defaultRequireApproval: false,
    description: "Get file metadata and text content.",
    group: "google_drive",
    label: "Drive get file",
    riskSummary: "Sentinel can read your Google Drive files without stopping for confirmation.",
  },
  gdrive_create_folder: {
    defaultRequireApproval: true,
    description: "Create a new folder in Google Drive.",
    group: "google_drive",
    label: "Drive create folder",
    riskSummary: "Sentinel can create folders in your Drive without stopping for confirmation.",
  },
  gdrive_upload: {
    defaultRequireApproval: true,
    description: "Upload a local file to Google Drive.",
    group: "google_drive",
    label: "Drive upload",
    riskSummary: "Sentinel can upload files from your workspace to Drive without stopping for confirmation.",
  },
  gdrive_download: {
    defaultRequireApproval: true,
    description: "Download a file from Google Drive to the local filesystem.",
    group: "google_drive",
    label: "Drive download",
    riskSummary: "Sentinel can download files from Drive to your workspace without stopping for confirmation.",
  },
  gdrive_move: {
    defaultRequireApproval: true,
    description: "Move a file to a different folder.",
    group: "google_drive",
    label: "Drive move",
    riskSummary: "Sentinel can move files between Drive folders without stopping for confirmation.",
  },
  gdrive_rename: {
    defaultRequireApproval: true,
    description: "Rename a file in Google Drive.",
    group: "google_drive",
    label: "Drive rename",
    riskSummary: "Sentinel can rename your Drive files without stopping for confirmation.",
  },
  gdrive_trash: {
    defaultRequireApproval: true,
    description: "Move a file to trash in Google Drive.",
    group: "google_drive",
    label: "Drive trash",
    riskSummary: "Sentinel can trash your Drive files without stopping for confirmation.",
  },
  gdrive_share: {
    defaultRequireApproval: true,
    description: "Share a file with another user.",
    group: "google_drive",
    label: "Drive share",
    riskSummary: "Sentinel can share your Drive files without stopping for confirmation.",
  },
  gh_search_repos: {
    defaultRequireApproval: false,
    description: "Search GitHub repositories.",
    group: "github",
    label: "GitHub search repos",
    riskSummary: "Sentinel can search GitHub repositories without stopping for confirmation.",
  },
  gh_list_repos: {
    defaultRequireApproval: false,
    description: "List your GitHub repositories.",
    group: "github",
    label: "GitHub list repos",
    riskSummary: "Sentinel can list your repositories without stopping for confirmation.",
  },
  gh_get_repo: {
    defaultRequireApproval: false,
    description: "Get details of a GitHub repository.",
    group: "github",
    label: "GitHub get repo",
    riskSummary: "Sentinel can view repository details without stopping for confirmation.",
  },
  gh_list_issues: {
    defaultRequireApproval: false,
    description: "List issues in a repository.",
    group: "github",
    label: "GitHub list issues",
    riskSummary: "Sentinel can list repository issues without stopping for confirmation.",
  },
  gh_get_issue: {
    defaultRequireApproval: false,
    description: "Get details of a GitHub issue.",
    group: "github",
    label: "GitHub get issue",
    riskSummary: "Sentinel can view issue details without stopping for confirmation.",
  },
  gh_create_issue: {
    defaultRequireApproval: true,
    description: "Create a new issue in a repository.",
    group: "github",
    label: "GitHub create issue",
    riskSummary: "Sentinel can create issues without stopping for confirmation.",
  },
  gh_update_issue: {
    defaultRequireApproval: true,
    description: "Update an existing issue.",
    group: "github",
    label: "GitHub update issue",
    riskSummary: "Sentinel can modify issues without stopping for confirmation.",
  },
  gh_close_issue: {
    defaultRequireApproval: true,
    description: "Close a GitHub issue.",
    group: "github",
    label: "GitHub close issue",
    riskSummary: "Sentinel can close issues without stopping for confirmation.",
  },
  gh_add_issue_comment: {
    defaultRequireApproval: true,
    description: "Add a comment to a GitHub issue.",
    group: "github",
    label: "GitHub issue comment",
    riskSummary: "Sentinel can comment on issues without stopping for confirmation.",
  },
  gh_list_prs: {
    defaultRequireApproval: false,
    description: "List pull requests in a repository.",
    group: "github",
    label: "GitHub list PRs",
    riskSummary: "Sentinel can list pull requests without stopping for confirmation.",
  },
  gh_get_pr: {
    defaultRequireApproval: false,
    description: "Get details of a pull request.",
    group: "github",
    label: "GitHub get PR",
    riskSummary: "Sentinel can view pull request details without stopping for confirmation.",
  },
  gh_create_pr: {
    defaultRequireApproval: true,
    description: "Create a new pull request.",
    group: "github",
    label: "GitHub create PR",
    riskSummary: "Sentinel can create pull requests without stopping for confirmation.",
  },
  gh_merge_pr: {
    defaultRequireApproval: true,
    description: "Merge a pull request.",
    group: "github",
    label: "GitHub merge PR",
    riskSummary: "Sentinel can merge pull requests without stopping for confirmation.",
  },
  gh_review_pr: {
    defaultRequireApproval: true,
    description: "Submit a review on a pull request.",
    group: "github",
    label: "GitHub review PR",
    riskSummary: "Sentinel can submit PR reviews without stopping for confirmation.",
  },
  gh_add_pr_comment: {
    defaultRequireApproval: true,
    description: "Add a comment to a pull request.",
    group: "github",
    label: "GitHub PR comment",
    riskSummary: "Sentinel can comment on pull requests without stopping for confirmation.",
  },
  gh_search_code: {
    defaultRequireApproval: false,
    description: "Search code across GitHub repositories.",
    group: "github",
    label: "GitHub search code",
    riskSummary: "Sentinel can search code on GitHub without stopping for confirmation.",
  },
  gh_list_branches: {
    defaultRequireApproval: false,
    description: "List branches in a repository.",
    group: "github",
    label: "GitHub list branches",
    riskSummary: "Sentinel can list branches without stopping for confirmation.",
  },
  gh_create_branch: {
    defaultRequireApproval: true,
    description: "Create a new branch.",
    group: "github",
    label: "GitHub create branch",
    riskSummary: "Sentinel can create branches without stopping for confirmation.",
  },
  gh_list_runs: {
    defaultRequireApproval: false,
    description: "List GitHub Actions workflow runs.",
    group: "github",
    label: "GitHub list runs",
    riskSummary: "Sentinel can view workflow runs without stopping for confirmation.",
  },
  gh_get_run_logs: {
    defaultRequireApproval: false,
    description: "Get workflow run log URL.",
    group: "github",
    label: "GitHub run logs",
    riskSummary: "Sentinel can view workflow logs without stopping for confirmation.",
  },
  gh_rerun_workflow: {
    defaultRequireApproval: true,
    description: "Re-run a workflow.",
    group: "github",
    label: "GitHub rerun workflow",
    riskSummary: "Sentinel can re-run workflows without stopping for confirmation.",
  },
  gh_list_releases: {
    defaultRequireApproval: false,
    description: "List releases in a repository.",
    group: "github",
    label: "GitHub list releases",
    riskSummary: "Sentinel can view releases without stopping for confirmation.",
  },
  gh_create_release: {
    defaultRequireApproval: true,
    description: "Create a new release.",
    group: "github",
    label: "GitHub create release",
    riskSummary: "Sentinel can create releases without stopping for confirmation.",
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
    if (record.toolName.startsWith("group:")) {
      (overrides as Record<string, boolean>)[record.toolName] = Boolean(
        record.requireApproval,
      );
      continue;
    }

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
  const resolved = { ...DEFAULT_TOOL_APPROVAL_POLICIES };

  if (!overrides) return resolved;

  for (const [groupKey, group] of Object.entries(TOOL_APPROVAL_GROUPS)) {
    const groupOverride = (overrides as Record<string, boolean>)[
      `group:${groupKey}`
    ];
    if (typeof groupOverride === "boolean") {
      for (const toolName of group.toolNames) {
        if (toolName in resolved) {
          (resolved as Record<string, boolean>)[toolName] = groupOverride;
        }
      }
    }
  }

  for (const [toolName, value] of Object.entries(overrides)) {
    if (toolName.startsWith("group:")) continue;
    if (toolName in resolved && typeof value === "boolean") {
      (resolved as Record<string, boolean>)[toolName] = value;
    }
  }

  return resolved;
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

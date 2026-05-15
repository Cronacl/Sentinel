import { getToolName, type ToolPart } from "../types";
import type { Renderer } from "./renderer";
import { FileTool } from "./renderers/file";
import { GlobTool } from "./renderers/glob";
import { GrepTool } from "./renderers/grep";
import { ListTool } from "./renderers/list";
import { MemoryTool } from "./renderers/memory";
import { PlanTool } from "./renderers/plan";
import { ReadTool } from "./renderers/read";
import { LoadDocumentTool } from "./renderers/load-document";
import { RunTaskTool } from "./renderers/run-task";
import { RunSubagentTool } from "./renderers/run-subagent";
import { ShellTool } from "./renderers/shell";
import { SkillTool } from "./renderers/skill";
import { WebSearchTool } from "./renderers/websearch";
import { WebFetchTool } from "./renderers/webfetch";
import { BrowserTool } from "./renderers/browser";
import { ComputerTool } from "./renderers/computer";
import { GenerateImageTool } from "./renderers/generate-image";
import { GenerateVideoTool } from "./renderers/generate-video";
import { WorkspaceTool } from "./renderers/workspace";
import { GmailSearchTool } from "./renderers/integrations/gmail/gmail-search";
import { GmailEmailTool } from "./renderers/integrations/gmail/gmail-email";
import { GmailSendTool } from "./renderers/integrations/gmail/gmail-send";
import { GmailListLabelsTool } from "./renderers/integrations/gmail/gmail-labels";
import { GmailManageLabelsTool } from "./renderers/integrations/gmail/gmail-manage-labels";
import { GmailActionTool } from "./renderers/integrations/gmail/gmail-action";
import { GmailForwardTool } from "./renderers/integrations/gmail/gmail-forward";
import { GmailThreadTool } from "./renderers/integrations/gmail/gmail-thread";
import { GmailBulkActionTool } from "./renderers/integrations/gmail/gmail-bulk-action";
import { GCalEventsTool } from "./renderers/integrations/gcal/gcal-events";
import { GCalEventDetailTool } from "./renderers/integrations/gcal/gcal-event-detail";
import { GCalCreateEventTool } from "./renderers/integrations/gcal/gcal-create-event";
import { GCalListCalendarsTool } from "./renderers/integrations/gcal/gcal-list-calendars";
import { GCalDeleteEventTool } from "./renderers/integrations/gcal/gcal-delete-event";
import { GCalFreeBusyTool } from "./renderers/integrations/gcal/gcal-free-busy";
import { GCalQuickAddTool } from "./renderers/integrations/gcal/gcal-quick-add";
import { GCalRsvpTool } from "./renderers/integrations/gcal/gcal-rsvp";
import { GCalMoveEventTool } from "./renderers/integrations/gcal/gcal-move-event";
import { GDriveSearchTool } from "./renderers/integrations/gdrive/gdrive-search";
import { GDriveFileDetailTool } from "./renderers/integrations/gdrive/gdrive-file-detail";
import { GDriveUploadTool } from "./renderers/integrations/gdrive/gdrive-upload";
import { GDriveDownloadTool } from "./renderers/integrations/gdrive/gdrive-download";
import { GDriveActionTool } from "./renderers/integrations/gdrive/gdrive-action";
import { GDriveFolderTool } from "./renderers/integrations/gdrive/gdrive-folder";
import { GHSearchTool } from "./renderers/integrations/github/gh-search";
import { GHRepoTool } from "./renderers/integrations/github/gh-repo";
import { GHIssueDetailTool } from "./renderers/integrations/github/gh-issue-detail";
import { GHPRDetailTool } from "./renderers/integrations/github/gh-pr-detail";
import { GHIssueActionTool } from "./renderers/integrations/github/gh-issue-action";
import { GHPRActionTool } from "./renderers/integrations/github/gh-pr-action";
import { GHBranchTool } from "./renderers/integrations/github/gh-branch";
import { GHActionsTool } from "./renderers/integrations/github/gh-actions";
import { GHReleaseTool } from "./renderers/integrations/github/gh-release";
import { LinearIssueDetailTool } from "./renderers/integrations/linear/linear-issue-detail";
import { LinearIssueActionTool } from "./renderers/integrations/linear/linear-issue-action";
import { LinearCommentTool } from "./renderers/integrations/linear/linear-comment";
import { LinearProjectTool } from "./renderers/integrations/linear/linear-project";
import { LinearTeamTool } from "./renderers/integrations/linear/linear-team";
import { LinearCycleTool } from "./renderers/integrations/linear/linear-cycle";
import { LinearLabelTool } from "./renderers/integrations/linear/linear-label";
import { LinearUsersTool } from "./renderers/integrations/linear/linear-users";
import { LinearWorkflowStatesTool } from "./renderers/integrations/linear/linear-workflow-states";
import { NotionPageDetailTool } from "./renderers/integrations/notion/notion-page-detail";
import { NotionPageActionTool } from "./renderers/integrations/notion/notion-page-action";
import { NotionDatabaseTool } from "./renderers/integrations/notion/notion-database";
import { NotionDatabaseActionTool } from "./renderers/integrations/notion/notion-database-action";
import { NotionBlocksTool } from "./renderers/integrations/notion/notion-blocks";
import { NotionCommentTool } from "./renderers/integrations/notion/notion-comment";
import { NotionUsersTool } from "./renderers/integrations/notion/notion-users";
import { SlackChannelTool } from "./renderers/integrations/slack/slack-channel";
import { SlackChannelActionTool } from "./renderers/integrations/slack/slack-channel-action";
import { SlackMessageTool } from "./renderers/integrations/slack/slack-message";
import { SlackMessageActionTool } from "./renderers/integrations/slack/slack-message-action";
import { SlackUsersTool } from "./renderers/integrations/slack/slack-users";
import { AirtableBaseTool } from "./renderers/integrations/airtable/airtable-base";
import { AirtableTableTool } from "./renderers/integrations/airtable/airtable-table";
import { AirtableTableActionTool } from "./renderers/integrations/airtable/airtable-table-action";
import { AirtableRecordTool } from "./renderers/integrations/airtable/airtable-record";
import { AirtableRecordActionTool } from "./renderers/integrations/airtable/airtable-record-action";
import { AirtableCommentTool } from "./renderers/integrations/airtable/airtable-comment";
import { AirtableUserTool } from "./renderers/integrations/airtable/airtable-user";
import { IntegrationGenericTool } from "./renderers/integrations/shared/generic";
import {
  YFinanceSearchTool,
  YFinanceQuoteTool,
  YFinanceChartTool,
} from "./renderers/integrations/yahoo-finance/yfinance-tools";
import {
  ArxivSearchTool,
  ArxivPaperTool,
} from "./renderers/integrations/arxiv/arxiv-tools";
import {
  PubMedSearchTool,
  PubMedArticleTool,
} from "./renderers/integrations/pubmed/pubmed-tools";
import { PgListTool } from "./renderers/integrations/database/postgresql/pg-list";
import { PgDescribeTool } from "./renderers/integrations/database/postgresql/pg-describe";
import { PgQueryTool } from "./renderers/integrations/database/postgresql/pg-query";
import { PgExecuteTool } from "./renderers/integrations/database/postgresql/pg-execute";
import { MysqlListTool } from "./renderers/integrations/database/mysql/mysql-list";
import { MysqlDescribeTool } from "./renderers/integrations/database/mysql/mysql-describe";
import { MysqlQueryTool } from "./renderers/integrations/database/mysql/mysql-query";
import { MysqlExecuteTool } from "./renderers/integrations/database/mysql/mysql-execute";
import { MongoListTool } from "./renderers/integrations/database/mongodb/mongo-list";
import { MongoFindTool } from "./renderers/integrations/database/mongodb/mongo-find";
import { MongoMutationTool } from "./renderers/integrations/database/mongodb/mongo-mutation";
import { MongoAggregateTool } from "./renderers/integrations/database/mongodb/mongo-aggregate";
import { MongoCountTool } from "./renderers/integrations/database/mongodb/mongo-count";
import { CodexRuntimeTool } from "./renderers/codex-runtime";
import { CodexFileChangeTool } from "./renderers/codex-file-change";
import { CodexImageViewTool } from "./renderers/codex-image-view";
import { CodexMcpTool } from "./renderers/codex-mcp";
import { CodexPlanTool } from "./renderers/codex-plan";
import { CodexShellTool } from "./renderers/codex-shell";
import {
  CodexCollabAgentTool,
  CodexContextCompactionTool,
  CodexReviewModeTool,
} from "./renderers/codex-status";
import { CodexUserInputTool } from "./renderers/codex-user-input";
import { CodexWebSearchTool } from "./renderers/codex-web-search";
import { ClaudeAgentTool } from "./renderers/claude-agent";
import {
  ClaudeFileEditTool,
  ClaudeFileWriteTool,
} from "./renderers/claude-file-change";
import { ClaudeFileReadTool } from "./renderers/claude-file-read";
import { ClaudeMcpResourceTool } from "./renderers/claude-mcp";
import { ClaudePlanTool } from "./renderers/claude-plan";
import { ClaudeRuntimeTool } from "./renderers/claude-runtime";
import { ClaudeGlobTool, ClaudeGrepTool } from "./renderers/claude-search";
import { ClaudeSessionUtilityTool } from "./renderers/claude-session";
import { ClaudeShellTool } from "./renderers/claude-shell";
import { ClaudeTodoWriteTool } from "./renderers/claude-todo";
import { ClaudeUserInputTool } from "./renderers/claude-user-input";
import {
  ClaudeListDirTool,
  ClaudeToolSearchTool,
} from "./renderers/claude-utility";
import {
  ClaudeWebFetchTool,
  ClaudeWebSearchTool,
} from "./renderers/claude-web";
import { CopilotAgentTool } from "./renderers/copilot-agent";
import {
  CopilotApplyPatchTool,
  CopilotCreateTool,
  CopilotEditTool,
  CopilotShowFileTool,
  CopilotViewTool,
} from "./renderers/copilot-file";
import { CopilotMemoryTool } from "./renderers/copilot-memory";
import { CopilotRuntimeTool } from "./renderers/copilot-runtime";
import { CopilotGlobTool, CopilotGrepTool } from "./renderers/copilot-search";
import { CopilotSessionUtilityTool } from "./renderers/copilot-session";
import { CopilotShellTool } from "./renderers/copilot-shell";
import { CopilotTodoTool } from "./renderers/copilot-todo";
import { CopilotUserInputTool } from "./renderers/copilot-user-input";
import { CopilotWebFetchTool } from "./renderers/copilot-web";
import {
  CursorAgentTool,
  CursorFileTool,
  CursorImageTool,
  CursorMcpTool,
  CursorPermissionTool,
  CursorPlanTool,
  CursorRuntimeTool,
  CursorSearchTool,
  CursorShellTool,
  CursorTodoTool,
  CursorWebFetchTool,
  CursorWebSearchTool,
  OpenCodeAgentTool,
  OpenCodeFileTool,
  OpenCodeImageTool,
  OpenCodeMcpTool,
  OpenCodePermissionTool,
  OpenCodePlanTool,
  OpenCodeRuntimeTool,
  OpenCodeSearchTool,
  OpenCodeShellTool,
  OpenCodeTodoTool,
  OpenCodeWebFetchTool,
  OpenCodeWebSearchTool,
} from "./renderers/external-runtime";
import {
  CursorUserInputTool,
  OpenCodeUserInputTool,
} from "./renderers/external-runtime/user-input";

const renderers: Record<string, Renderer> = {
  apply_patch: WorkspaceTool,
  batch_read: WorkspaceTool,
  create_file: FileTool,
  create_plan: PlanTool,
  delete_file: FileTool,
  diagnostics: WorkspaceTool,
  diff: WorkspaceTool,
  edit: FileTool,
  multiedit: FileTool,
  git: WorkspaceTool,
  grep: GrepTool,
  glob: GlobTool,
  list: ListTool,
  ask_question: PlanTool,
  forget_memory: MemoryTool,
  manage_task: PlanTool,
  read: ReadTool,
  load_document: LoadDocumentTool,
  run_task: RunTaskTool,
  run_subagent: RunSubagentTool,
  save_memory: MemoryTool,
  search_memory: MemoryTool,
  shell_command: ShellTool,
  load_skill: SkillTool,
  move_file: WorkspaceTool,
  update_plan: PlanTool,
  websearch: WebSearchTool,
  webfetch: WebFetchTool,
  browser_tabs: BrowserTool,
  browser_open: BrowserTool,
  browser_navigate: BrowserTool,
  browser_back: BrowserTool,
  browser_forward: BrowserTool,
  browser_reload: BrowserTool,
  browser_snapshot: BrowserTool,
  browser_screenshot: BrowserTool,
  browser_click: BrowserTool,
  browser_fill: BrowserTool,
  browser_press: BrowserTool,
  browser_console_logs: BrowserTool,
  computer_status: ComputerTool,
  computer_screenshot: ComputerTool,
  computer_action: ComputerTool,
  computer_apps: ComputerTool,
  computer_app: ComputerTool,
  computer_clipboard: ComputerTool,
  computer_ax_tree: ComputerTool,
  computer_ax_find: ComputerTool,
  computer_ax_action: ComputerTool,
  generate_image: GenerateImageTool,
  generate_video: GenerateVideoTool,

  gmail_search: GmailSearchTool,
  gmail_get_email: GmailEmailTool,
  gmail_send: GmailSendTool,
  gmail_reply: GmailSendTool,
  gmail_create_draft: GmailSendTool,
  gmail_list_labels: GmailListLabelsTool,
  gmail_manage_labels: GmailManageLabelsTool,
  gmail_archive: GmailActionTool,
  gmail_trash: GmailActionTool,
  gmail_star: GmailActionTool,
  gmail_unstar: GmailActionTool,
  gmail_mark_read: GmailActionTool,
  gmail_mark_unread: GmailActionTool,
  gmail_forward: GmailForwardTool,
  gmail_get_thread: GmailThreadTool,
  gmail_bulk_action: GmailBulkActionTool,

  gcal_list_calendars: GCalListCalendarsTool,
  gcal_get_events: GCalEventsTool,
  gcal_get_event: GCalEventDetailTool,
  gcal_create_event: GCalCreateEventTool,
  gcal_update_event: GCalCreateEventTool,
  gcal_delete_event: GCalDeleteEventTool,
  gcal_get_free_busy: GCalFreeBusyTool,
  gcal_quick_add: GCalQuickAddTool,
  gcal_rsvp: GCalRsvpTool,
  gcal_move_event: GCalMoveEventTool,
  gcal_get_today: GCalEventsTool,

  gdrive_search: GDriveSearchTool,
  gdrive_list_files: GDriveSearchTool,
  gdrive_get_file: GDriveFileDetailTool,
  gdrive_create_folder: GDriveFolderTool,
  gdrive_upload: GDriveUploadTool,
  gdrive_download: GDriveDownloadTool,
  gdrive_move: GDriveActionTool,
  gdrive_rename: GDriveActionTool,
  gdrive_trash: GDriveActionTool,
  gdrive_share: GDriveActionTool,

  gh_search_repos: GHSearchTool,
  gh_search_code: GHSearchTool,
  gh_list_repos: GHRepoTool,
  gh_get_repo: GHRepoTool,
  gh_list_issues: GHIssueDetailTool,
  gh_get_issue: GHIssueDetailTool,
  gh_create_issue: GHIssueActionTool,
  gh_update_issue: GHIssueActionTool,
  gh_close_issue: GHIssueActionTool,
  gh_add_issue_comment: GHIssueActionTool,
  gh_list_prs: GHPRDetailTool,
  gh_get_pr: GHPRDetailTool,
  gh_create_pr: GHPRActionTool,
  gh_merge_pr: GHPRActionTool,
  gh_review_pr: GHPRActionTool,
  gh_add_pr_comment: GHPRActionTool,
  gh_list_branches: GHBranchTool,
  gh_create_branch: GHBranchTool,
  gh_list_runs: GHActionsTool,
  gh_get_run_logs: GHActionsTool,
  gh_rerun_workflow: GHActionsTool,
  gh_list_releases: GHReleaseTool,
  gh_create_release: GHReleaseTool,

  linear_search_issues: LinearIssueDetailTool,
  linear_list_issues: LinearIssueDetailTool,
  linear_get_issue: LinearIssueDetailTool,
  linear_create_issue: LinearIssueActionTool,
  linear_update_issue: LinearIssueActionTool,
  linear_delete_issue: LinearIssueActionTool,
  linear_list_comments: LinearCommentTool,
  linear_create_comment: LinearCommentTool,
  linear_list_projects: LinearProjectTool,
  linear_get_project: LinearProjectTool,
  linear_create_project: LinearProjectTool,
  linear_update_project: LinearProjectTool,
  linear_list_teams: LinearTeamTool,
  linear_get_team: LinearTeamTool,
  linear_list_cycles: LinearCycleTool,
  linear_get_current_cycle: LinearCycleTool,
  linear_list_labels: LinearLabelTool,
  linear_create_label: LinearLabelTool,
  linear_list_users: LinearUsersTool,
  linear_list_workflow_states: LinearWorkflowStatesTool,

  // Notion
  notion_search: NotionPageDetailTool,
  notion_get_page: NotionPageDetailTool,
  notion_create_page: NotionPageActionTool,
  notion_update_page: NotionPageActionTool,
  notion_archive_page: NotionPageActionTool,
  notion_list_databases: NotionDatabaseTool,
  notion_query_database: NotionDatabaseTool,
  notion_create_database_entry: NotionDatabaseActionTool,
  notion_update_database_entry: NotionDatabaseActionTool,
  notion_get_blocks: NotionBlocksTool,
  notion_append_blocks: NotionBlocksTool,
  notion_list_comments: NotionCommentTool,
  notion_create_comment: NotionCommentTool,
  notion_list_users: NotionUsersTool,
  notion_get_user: NotionUsersTool,

  // Slack
  slack_list_channels: SlackChannelTool,
  slack_get_channel: SlackChannelTool,
  slack_create_channel: SlackChannelActionTool,
  slack_archive_channel: SlackChannelActionTool,
  slack_invite_to_channel: SlackChannelActionTool,
  slack_kick_from_channel: SlackChannelActionTool,
  slack_set_topic: SlackChannelActionTool,
  slack_set_purpose: SlackChannelActionTool,
  slack_search_messages: SlackMessageTool,
  slack_get_history: SlackMessageTool,
  slack_get_thread: SlackMessageTool,
  slack_post_message: SlackMessageActionTool,
  slack_reply_to_thread: SlackMessageActionTool,
  slack_update_message: SlackMessageActionTool,
  slack_delete_message: SlackMessageActionTool,
  slack_add_reaction: SlackMessageActionTool,
  slack_schedule_message: SlackMessageActionTool,
  slack_pin_message: SlackMessageActionTool,
  slack_unpin_message: SlackMessageActionTool,
  slack_list_users: SlackUsersTool,
  slack_get_user: SlackUsersTool,

  // Airtable
  airtable_list_bases: AirtableBaseTool,
  airtable_list_tables: AirtableTableTool,
  airtable_get_table: AirtableTableTool,
  airtable_create_table: AirtableTableActionTool,
  airtable_create_field: AirtableTableActionTool,
  airtable_update_field: AirtableTableActionTool,
  airtable_list_records: AirtableRecordTool,
  airtable_get_record: AirtableRecordTool,
  airtable_create_records: AirtableRecordActionTool,
  airtable_update_records: AirtableRecordActionTool,
  airtable_delete_records: AirtableRecordActionTool,
  airtable_list_comments: AirtableCommentTool,
  airtable_create_comment: AirtableCommentTool,
  airtable_get_user: AirtableUserTool,

  // PostgreSQL
  pg_list_databases: PgListTool,
  pg_list_schemas: PgListTool,
  pg_list_tables: PgListTool,
  pg_describe_table: PgDescribeTool,
  pg_query: PgQueryTool,
  pg_execute: PgExecuteTool,

  // MySQL
  mysql_list_databases: MysqlListTool,
  mysql_list_tables: MysqlListTool,
  mysql_describe_table: MysqlDescribeTool,
  mysql_query: MysqlQueryTool,
  mysql_execute: MysqlExecuteTool,

  // MongoDB
  mongo_list_databases: MongoListTool,
  mongo_list_collections: MongoListTool,
  mongo_find: MongoFindTool,
  mongo_find_one: MongoFindTool,
  mongo_insert_one: MongoMutationTool,
  mongo_insert_many: MongoMutationTool,
  mongo_update_one: MongoMutationTool,
  mongo_update_many: MongoMutationTool,
  mongo_aggregate: MongoAggregateTool,
  mongo_count: MongoCountTool,
  mongo_distinct: MongoCountTool,

  // Yahoo Finance
  yfinance_get_quote: YFinanceQuoteTool,
  yfinance_search: YFinanceSearchTool,
  yfinance_get_chart: YFinanceChartTool,

  // ArXiv
  arxiv_search: ArxivSearchTool,
  arxiv_get_paper: ArxivPaperTool,

  // PubMed
  pubmed_search: PubMedSearchTool,
  pubmed_get_article: PubMedArticleTool,
};

const codexRenderers: Record<string, Renderer> = {
  codex_collab_agent: CodexCollabAgentTool,
  codex_command_execution: CodexShellTool,
  codex_context_compaction: CodexContextCompactionTool,
  codex_file_change: CodexFileChangeTool,
  codex_image_view: CodexImageViewTool,
  codex_mcp_tool_call: CodexMcpTool,
  codex_plan: CodexPlanTool,
  codex_review_mode: CodexReviewModeTool,
  codex_user_input: CodexUserInputTool,
  codex_web_search: CodexWebSearchTool,
};
export const KNOWN_CODEX_RENDERER_TOOL_NAMES = Object.freeze(
  Object.keys(codexRenderers).sort(),
);

const claudeRenderers: Record<string, Renderer> = {
  claude_agent: ClaudeAgentTool,
  claude_bash: ClaudeShellTool,
  claude_config: ClaudeSessionUtilityTool,
  claude_dispatch_agent: ClaudeAgentTool,
  claude_dispatchagent: ClaudeAgentTool,
  claude_edit: ClaudeFileEditTool,
  claude_enterworktree: ClaudeSessionUtilityTool,
  claude_exitplanmode: ClaudePlanTool,
  claude_glob: ClaudeGlobTool,
  claude_grep: ClaudeGrepTool,
  claude_listmcpresources: ClaudeMcpResourceTool,
  claude_listdir: ClaudeListDirTool,
  claude_ls: ClaudeListDirTool,
  claude_multiedit: ClaudeFileEditTool,
  claude_notebookedit: ClaudeFileEditTool,
  claude_notebookread: ClaudeFileReadTool,
  claude_read: ClaudeFileReadTool,
  claude_readmcpresource: ClaudeMcpResourceTool,
  claude_skill: SkillTool,
  claude_subscribemcpresource: ClaudeMcpResourceTool,
  claude_subscribepolling: ClaudeMcpResourceTool,
  claude_task: ClaudeAgentTool,
  claude_taskoutput: ClaudeSessionUtilityTool,
  claude_taskstop: ClaudeSessionUtilityTool,
  claude_todoread: ClaudeTodoWriteTool,
  claude_todowrite: ClaudeTodoWriteTool,
  claude_toolsearch: ClaudeToolSearchTool,
  claude_unsubscribemcpresource: ClaudeMcpResourceTool,
  claude_unsubscribepolling: ClaudeMcpResourceTool,
  claude_user_input: ClaudeUserInputTool,
  claude_webfetch: ClaudeWebFetchTool,
  claude_websearch: ClaudeWebSearchTool,
  claude_write: ClaudeFileWriteTool,
};
export const KNOWN_CLAUDE_RENDERER_TOOL_NAMES = Object.freeze(
  Object.keys(claudeRenderers).sort(),
);

const copilotRenderers: Record<string, Renderer> = {
  copilot_apply_patch: CopilotApplyPatchTool,
  copilot_ask_user: CopilotUserInputTool,
  copilot_bash: CopilotShellTool,
  copilot_create: CopilotCreateTool,
  copilot_custom_tool: CopilotSessionUtilityTool,
  copilot_edit: CopilotEditTool,
  copilot_exit_plan_mode: CopilotSessionUtilityTool,
  copilot_fetch_copilot_cli_documentation: CopilotWebFetchTool,
  copilot_glob: CopilotGlobTool,
  copilot_grep: CopilotGrepTool,
  copilot_hook: CopilotSessionUtilityTool,
  copilot_list_agents: CopilotAgentTool,
  copilot_list_bash: CopilotShellTool,
  copilot_list_powershell: CopilotShellTool,
  copilot_lsp: CopilotSessionUtilityTool,
  copilot_mcp: CopilotSessionUtilityTool,
  copilot_memory: CopilotMemoryTool,
  copilot_powershell: CopilotShellTool,
  copilot_read: CopilotViewTool,
  copilot_read_agent: CopilotAgentTool,
  copilot_read_bash: CopilotShellTool,
  copilot_read_powershell: CopilotShellTool,
  copilot_request_user_input: CopilotUserInputTool,
  copilot_report_intent: CopilotSessionUtilityTool,
  copilot_rg: CopilotGrepTool,
  copilot_runtime: CopilotSessionUtilityTool,
  copilot_shell: CopilotShellTool,
  copilot_show_file: CopilotShowFileTool,
  copilot_skill: CopilotSessionUtilityTool,
  copilot_sql: CopilotSessionUtilityTool,
  copilot_stop_bash: CopilotShellTool,
  copilot_stop_powershell: CopilotShellTool,
  copilot_store_memory: CopilotMemoryTool,
  copilot_task: CopilotAgentTool,
  copilot_task_complete: CopilotSessionUtilityTool,
  copilot_update_todo: CopilotTodoTool,
  copilot_url: CopilotWebFetchTool,
  copilot_view: CopilotViewTool,
  copilot_web_fetch: CopilotWebFetchTool,
  copilot_write: CopilotEditTool,
  copilot_write_bash: CopilotShellTool,
  copilot_write_powershell: CopilotShellTool,
};
export const KNOWN_COPILOT_RENDERER_TOOL_NAMES = Object.freeze(
  Object.keys(copilotRenderers).sort(),
);

const cursorRenderers: Record<string, Renderer> = {
  cursor_agent: CursorAgentTool,
  cursor_apply_patch: CursorFileTool,
  cursor_approval: CursorPermissionTool,
  cursor_ask_question: CursorUserInputTool,
  cursor_ask_user: CursorUserInputTool,
  cursor_ask_user_question: CursorUserInputTool,
  cursor_bash: CursorShellTool,
  cursor_command: CursorShellTool,
  cursor_create_file: CursorFileTool,
  cursor_create_plan: CursorPlanTool,
  cursor_delete_file: CursorFileTool,
  cursor_dispatch_agent: CursorAgentTool,
  cursor_edit: CursorFileTool,
  cursor_edit_file: CursorFileTool,
  cursor_execute_command: CursorShellTool,
  cursor_file: CursorFileTool,
  cursor_file_edit: CursorFileTool,
  cursor_find: CursorSearchTool,
  cursor_generate_image: CursorImageTool,
  cursor_glob: CursorSearchTool,
  cursor_grep: CursorSearchTool,
  cursor_image: CursorImageTool,
  cursor_list: CursorSearchTool,
  cursor_list_dir: CursorSearchTool,
  cursor_list_files: CursorSearchTool,
  cursor_ls: CursorSearchTool,
  cursor_mcp: CursorMcpTool,
  cursor_mcp_tool: CursorMcpTool,
  cursor_permission: CursorPermissionTool,
  cursor_plan: CursorPlanTool,
  cursor_read: CursorFileTool,
  cursor_read_file: CursorFileTool,
  cursor_request_permission: CursorPermissionTool,
  cursor_request_user_input: CursorUserInputTool,
  cursor_rg: CursorSearchTool,
  cursor_run_command: CursorShellTool,
  cursor_run_task: CursorAgentTool,
  cursor_search: CursorSearchTool,
  cursor_session: CursorRuntimeTool,
  cursor_shell: CursorShellTool,
  cursor_subagent: CursorAgentTool,
  cursor_task: CursorAgentTool,
  cursor_terminal: CursorShellTool,
  cursor_todo: CursorTodoTool,
  cursor_todo_read: CursorTodoTool,
  cursor_todo_write: CursorTodoTool,
  cursor_todowrite: CursorTodoTool,
  cursor_tool_permission: CursorPermissionTool,
  cursor_update_file: CursorFileTool,
  cursor_update_plan: CursorPlanTool,
  cursor_update_todo: CursorTodoTool,
  cursor_view: CursorFileTool,
  cursor_web_fetch: CursorWebFetchTool,
  cursor_web_search: CursorWebSearchTool,
  cursor_webfetch: CursorWebFetchTool,
  cursor_websearch: CursorWebSearchTool,
  cursor_write: CursorFileTool,
  cursor_write_file: CursorFileTool,
};
export const KNOWN_CURSOR_RENDERER_TOOL_NAMES = Object.freeze(
  Object.keys(cursorRenderers).sort(),
);

const openCodeRenderers: Record<string, Renderer> = {
  opencode_agent: OpenCodeAgentTool,
  opencode_apply_patch: OpenCodeFileTool,
  opencode_approval: OpenCodePermissionTool,
  opencode_ask_question: OpenCodeUserInputTool,
  opencode_ask_user: OpenCodeUserInputTool,
  opencode_ask_user_question: OpenCodeUserInputTool,
  opencode_bash: OpenCodeShellTool,
  opencode_command: OpenCodeShellTool,
  opencode_codesearch: OpenCodeSearchTool,
  opencode_create_file: OpenCodeFileTool,
  opencode_create_plan: OpenCodePlanTool,
  opencode_delete_file: OpenCodeFileTool,
  opencode_dispatch_agent: OpenCodeAgentTool,
  opencode_edit: OpenCodeFileTool,
  opencode_edit_file: OpenCodeFileTool,
  opencode_execute: OpenCodeShellTool,
  opencode_execute_command: OpenCodeShellTool,
  opencode_file: OpenCodeFileTool,
  opencode_file_edit: OpenCodeFileTool,
  opencode_find: OpenCodeSearchTool,
  opencode_generate_image: OpenCodeImageTool,
  opencode_glob: OpenCodeSearchTool,
  opencode_grep: OpenCodeSearchTool,
  opencode_image: OpenCodeImageTool,
  opencode_list: OpenCodeSearchTool,
  opencode_list_dir: OpenCodeSearchTool,
  opencode_list_files: OpenCodeSearchTool,
  opencode_ls: OpenCodeSearchTool,
  opencode_mcp: OpenCodeMcpTool,
  opencode_mcp_tool: OpenCodeMcpTool,
  opencode_permission: OpenCodePermissionTool,
  opencode_plan: OpenCodePlanTool,
  opencode_question: OpenCodeUserInputTool,
  opencode_read: OpenCodeFileTool,
  opencode_read_file: OpenCodeFileTool,
  opencode_request_permission: OpenCodePermissionTool,
  opencode_request_user_input: OpenCodeUserInputTool,
  opencode_rg: OpenCodeSearchTool,
  opencode_run_command: OpenCodeShellTool,
  opencode_run_task: OpenCodeAgentTool,
  opencode_search: OpenCodeSearchTool,
  opencode_session: OpenCodeRuntimeTool,
  opencode_shell: OpenCodeShellTool,
  opencode_subagent: OpenCodeAgentTool,
  opencode_task: OpenCodeAgentTool,
  opencode_terminal: OpenCodeShellTool,
  opencode_todo: OpenCodeTodoTool,
  opencode_todo_read: OpenCodeTodoTool,
  opencode_todo_write: OpenCodeTodoTool,
  opencode_todowrite: OpenCodeTodoTool,
  opencode_tool_permission: OpenCodePermissionTool,
  opencode_update_file: OpenCodeFileTool,
  opencode_update_plan: OpenCodePlanTool,
  opencode_update_todo: OpenCodeTodoTool,
  opencode_view: OpenCodeFileTool,
  opencode_web_fetch: OpenCodeWebFetchTool,
  opencode_web_search: OpenCodeWebSearchTool,
  opencode_webfetch: OpenCodeWebFetchTool,
  opencode_websearch: OpenCodeWebSearchTool,
  opencode_write: OpenCodeFileTool,
  opencode_write_file: OpenCodeFileTool,
};
export const KNOWN_OPENCODE_RENDERER_TOOL_NAMES = Object.freeze(
  Object.keys(openCodeRenderers).sort(),
);

export const ENGINE_TOOL_RENDERING_COVERAGE = Object.freeze({
  claude: KNOWN_CLAUDE_RENDERER_TOOL_NAMES,
  codex: KNOWN_CODEX_RENDERER_TOOL_NAMES,
  copilot: KNOWN_COPILOT_RENDERER_TOOL_NAMES,
  cursor: KNOWN_CURSOR_RENDERER_TOOL_NAMES,
  opencode: KNOWN_OPENCODE_RENDERER_TOOL_NAMES,
});

function normalizeLooseToolName(name: string) {
  return name.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function isStructuredUserInputToolName(name: string) {
  const normalized = normalizeLooseToolName(name);
  const withoutClaudePrefix = normalized.startsWith("claude")
    ? normalized.slice("claude".length)
    : normalized;
  const withoutCopilotPrefix = normalized.startsWith("copilot")
    ? normalized.slice("copilot".length)
    : normalized;
  const withoutCursorPrefix = normalized.startsWith("cursor")
    ? normalized.slice("cursor".length)
    : normalized;
  const withoutOpenCodePrefix = normalized.startsWith("opencode")
    ? normalized.slice("opencode".length)
    : normalized;

  return (
    normalized === "askuserquestion" ||
    normalized === "askuser" ||
    normalized === "requestuserinput" ||
    withoutClaudePrefix === "askuserquestion" ||
    withoutClaudePrefix === "requestuserinput" ||
    withoutCopilotPrefix === "askuser" ||
    withoutCopilotPrefix === "askuserquestion" ||
    withoutCopilotPrefix === "requestuserinput" ||
    withoutCursorPrefix === "askquestion" ||
    withoutCursorPrefix === "askuser" ||
    withoutCursorPrefix === "askuserquestion" ||
    withoutCursorPrefix === "requestuserinput" ||
    withoutOpenCodePrefix === "askquestion" ||
    withoutOpenCodePrefix === "askuser" ||
    withoutOpenCodePrefix === "askuserquestion" ||
    withoutOpenCodePrefix === "requestuserinput"
  );
}

function isIntegrationToolName(name: string) {
  return (
    name.startsWith("gmail_") ||
    name.startsWith("gcal_") ||
    name.startsWith("gdrive_") ||
    name.startsWith("gh_") ||
    name.startsWith("linear_") ||
    name.startsWith("notion_") ||
    name.startsWith("slack_") ||
    name.startsWith("airtable_") ||
    name.startsWith("pg_") ||
    name.startsWith("mysql_") ||
    name.startsWith("mongo_") ||
    name.startsWith("yfinance_") ||
    name.startsWith("arxiv_") ||
    name.startsWith("pubmed_")
  );
}

function shouldUseIntegrationGeneric(part: ToolPart) {
  const toolName = getToolName(part);

  return (
    isIntegrationToolName(toolName) &&
    (part.state === "approval-requested" ||
      part.state === "approval-responded" ||
      part.state === "output-denied" ||
      part.state === "output-error")
  );
}

function resolveIntegrationFallback(name: string): Renderer | undefined {
  if (isIntegrationToolName(name)) return IntegrationGenericTool;
  return undefined;
}

function matchesAny(name: string, tokens: string[]) {
  return tokens.some((token) => name.includes(token));
}

function resolveCursorRenderer(name: string): Renderer {
  const exact = cursorRenderers[name];
  if (exact) return exact;
  const toolName = name.replace(/^cursor_/, "");

  if (isStructuredUserInputToolName(name)) return CursorUserInputTool;
  if (matchesAny(toolName, ["permission", "approval"])) {
    return CursorPermissionTool;
  }

  if (matchesAny(toolName, ["websearch", "web_search"])) {
    return CursorWebSearchTool;
  }
  if (
    matchesAny(toolName, ["webfetch", "web_fetch", "fetch_url", "url_fetch"])
  ) {
    return CursorWebFetchTool;
  }
  if (matchesAny(toolName, ["agent", "task", "subagent", "dispatch"])) {
    return CursorAgentTool;
  }
  if (matchesAny(toolName, ["mcp"])) return CursorMcpTool;
  if (matchesAny(toolName, ["generate_image", "image_gen"])) {
    return CursorImageTool;
  }
  if (matchesAny(toolName, ["todowrite", "todo_write", "todo_read"])) {
    return CursorTodoTool;
  }

  if (matchesAny(toolName, ["bash", "shell", "command", "terminal", "exec"])) {
    return CursorShellTool;
  }
  if (
    matchesAny(toolName, [
      "file",
      "read",
      "write",
      "edit",
      "patch",
      "create",
      "delete",
      "view",
      "open",
      "save",
    ])
  ) {
    return CursorFileTool;
  }
  if (
    matchesAny(toolName, ["grep", "glob", "search", "find", "list", "ls", "rg"])
  ) {
    return CursorSearchTool;
  }
  if (matchesAny(toolName, ["plan"])) return CursorPlanTool;
  if (matchesAny(toolName, ["todo"])) return CursorTodoTool;
  if (matchesAny(toolName, ["image"])) return CursorImageTool;

  return CursorRuntimeTool;
}

function resolveOpenCodeRenderer(name: string): Renderer {
  const exact = openCodeRenderers[name];
  if (exact) return exact;
  const toolName = name.replace(/^opencode_/, "");

  if (isStructuredUserInputToolName(name)) return OpenCodeUserInputTool;
  if (matchesAny(toolName, ["permission", "approval"])) {
    return OpenCodePermissionTool;
  }

  if (matchesAny(toolName, ["websearch", "web_search"])) {
    return OpenCodeWebSearchTool;
  }
  if (
    matchesAny(toolName, ["webfetch", "web_fetch", "fetch_url", "url_fetch"])
  ) {
    return OpenCodeWebFetchTool;
  }
  if (matchesAny(toolName, ["agent", "task", "subagent", "dispatch"])) {
    return OpenCodeAgentTool;
  }
  if (matchesAny(toolName, ["mcp"])) return OpenCodeMcpTool;
  if (matchesAny(toolName, ["generate_image", "image_gen"])) {
    return OpenCodeImageTool;
  }
  if (matchesAny(toolName, ["todowrite", "todo_write", "todo_read"])) {
    return OpenCodeTodoTool;
  }

  if (matchesAny(toolName, ["bash", "shell", "command", "terminal", "exec"])) {
    return OpenCodeShellTool;
  }
  if (
    matchesAny(toolName, [
      "file",
      "read",
      "write",
      "edit",
      "patch",
      "create",
      "delete",
      "view",
      "open",
      "save",
    ])
  ) {
    return OpenCodeFileTool;
  }
  if (
    matchesAny(toolName, ["grep", "glob", "search", "find", "list", "ls", "rg"])
  ) {
    return OpenCodeSearchTool;
  }
  if (matchesAny(toolName, ["plan"])) return OpenCodePlanTool;
  if (matchesAny(toolName, ["todo"])) return OpenCodeTodoTool;
  if (matchesAny(toolName, ["image"])) return OpenCodeImageTool;

  return OpenCodeRuntimeTool;
}

function resolveEngineRenderer(name: string): Renderer | undefined {
  if (name.startsWith("codex_")) {
    return codexRenderers[name] ?? CodexRuntimeTool;
  }

  if (name.startsWith("claude_")) {
    return claudeRenderers[name] ?? ClaudeRuntimeTool;
  }

  if (name.startsWith("copilot_")) {
    return copilotRenderers[name] ?? CopilotRuntimeTool;
  }

  if (name.startsWith("cursor_")) {
    return resolveCursorRenderer(name);
  }

  if (name.startsWith("opencode_")) {
    return resolveOpenCodeRenderer(name);
  }

  return undefined;
}

function resolveStructuredUserInputRenderer(name: string) {
  if (!isStructuredUserInputToolName(name)) return undefined;

  if (name.startsWith("copilot_")) return CopilotUserInputTool;
  if (name.startsWith("cursor_")) return CursorUserInputTool;
  if (name.startsWith("opencode_")) return OpenCodeUserInputTool;

  return ClaudeUserInputTool;
}

function resolveToolNameRenderer(name: string): Renderer | undefined {
  const exact = renderers[name];
  if (exact) return exact;

  const structuredUserInput = resolveStructuredUserInputRenderer(name);
  if (structuredUserInput) return structuredUserInput;

  const engineRenderer = resolveEngineRenderer(name);
  if (engineRenderer) return engineRenderer;

  return resolveIntegrationFallback(name);
}

export function resolveRenderer(part: ToolPart): Renderer | undefined {
  if (shouldUseIntegrationGeneric(part)) {
    return IntegrationGenericTool;
  }

  return resolveToolNameRenderer(getToolName(part));
}

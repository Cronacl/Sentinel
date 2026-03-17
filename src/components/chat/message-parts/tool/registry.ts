import { getToolName, type ToolPart } from "../types";
import type { Renderer } from "./renderer";
import { FileTool } from "./renderers/file";
import { GlobTool } from "./renderers/glob";
import { GrepTool } from "./renderers/grep";
import { ListTool } from "./renderers/list";
import { MemoryTool } from "./renderers/memory";
import { PlanTool } from "./renderers/plan";
import { ReadTool } from "./renderers/read";
import { RunTaskTool } from "./renderers/run-task";
import { ShellTool } from "./renderers/shell";
import { SkillTool } from "./renderers/skill";
import { WebSearchTool } from "./renderers/websearch";
import { WebFetchTool } from "./renderers/webfetch";
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
  run_task: RunTaskTool,
  save_memory: MemoryTool,
  search_memory: MemoryTool,
  shell_command: ShellTool,
  load_skill: SkillTool,
  move_file: WorkspaceTool,
  update_plan: PlanTool,
  websearch: WebSearchTool,
  webfetch: WebFetchTool,

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
};

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
    name.startsWith("mongo_")
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

export function resolveRenderer(part: ToolPart): Renderer | undefined {
  if (shouldUseIntegrationGeneric(part)) {
    return IntegrationGenericTool;
  }

  if (part.type === "dynamic-tool") {
    return (
      renderers[part.toolName] ?? resolveIntegrationFallback(part.toolName)
    );
  }

  return renderers[part.type.slice(5)];
}

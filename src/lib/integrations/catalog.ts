import type { ToolCatalogEntry } from "@/lib/ai/chat/tools/catalog";

export const INTEGRATION_TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  gmail_search: {
    capability: "to search Gmail emails by query, label, or date",
    category: "integration",
    label: "gmail_search",
  },
  gmail_get_email: {
    capability: "to read full email content by ID",
    category: "integration",
    label: "gmail_get_email",
  },
  gmail_send: {
    capability: "to send a new email",
    category: "integration",
    label: "gmail_send",
  },
  gmail_reply: {
    capability: "to reply to an email thread",
    category: "integration",
    label: "gmail_reply",
  },
  gmail_create_draft: {
    capability: "to create a draft email",
    category: "integration",
    label: "gmail_create_draft",
  },
  gmail_list_labels: {
    capability: "to list Gmail labels",
    category: "integration",
    label: "gmail_list_labels",
  },
  gmail_manage_labels: {
    capability: "to add or remove labels from emails",
    category: "integration",
    label: "gmail_manage_labels",
  },
  gmail_archive: {
    capability: "to archive an email",
    category: "integration",
    label: "gmail_archive",
  },
  gmail_trash: {
    capability: "to move an email to trash",
    category: "integration",
    label: "gmail_trash",
  },
  gmail_star: {
    capability: "to star an email",
    category: "integration",
    label: "gmail_star",
  },
  gmail_unstar: {
    capability: "to unstar an email",
    category: "integration",
    label: "gmail_unstar",
  },
  gmail_mark_read: {
    capability: "to mark an email as read",
    category: "integration",
    label: "gmail_mark_read",
  },
  gmail_mark_unread: {
    capability: "to mark an email as unread",
    category: "integration",
    label: "gmail_mark_unread",
  },
  gmail_forward: {
    capability: "to forward an email to another recipient",
    category: "integration",
    label: "gmail_forward",
  },
  gmail_get_thread: {
    capability: "to get all messages in an email thread",
    category: "integration",
    label: "gmail_get_thread",
  },
  gmail_bulk_action: {
    capability: "to perform bulk actions on multiple emails",
    category: "integration",
    label: "gmail_bulk_action",
  },
  gcal_list_calendars: {
    capability: "to list Google Calendar calendars",
    category: "integration",
    label: "gcal_list_calendars",
  },
  gcal_get_events: {
    capability: "to get calendar events in a date range",
    category: "integration",
    label: "gcal_get_events",
  },
  gcal_get_event: {
    capability: "to get details of a single calendar event",
    category: "integration",
    label: "gcal_get_event",
  },
  gcal_create_event: {
    capability: "to create a new calendar event",
    category: "integration",
    label: "gcal_create_event",
  },
  gcal_update_event: {
    capability: "to update an existing calendar event",
    category: "integration",
    label: "gcal_update_event",
  },
  gcal_delete_event: {
    capability: "to delete a calendar event",
    category: "integration",
    label: "gcal_delete_event",
  },
  gcal_get_free_busy: {
    capability: "to check free/busy status",
    category: "integration",
    label: "gcal_get_free_busy",
  },
  gcal_quick_add: {
    capability: "to create a calendar event from natural language text",
    category: "integration",
    label: "gcal_quick_add",
  },
  gcal_rsvp: {
    capability: "to respond to a calendar event invitation",
    category: "integration",
    label: "gcal_rsvp",
  },
  gcal_move_event: {
    capability: "to move a calendar event between calendars",
    category: "integration",
    label: "gcal_move_event",
  },
  gcal_get_today: {
    capability: "to get today's calendar events",
    category: "integration",
    label: "gcal_get_today",
  },
  gdrive_search: {
    capability: "to search Google Drive files by name or content",
    category: "integration",
    label: "gdrive_search",
  },
  gdrive_list_files: {
    capability: "to list files in a Google Drive folder",
    category: "integration",
    label: "gdrive_list_files",
  },
  gdrive_get_file: {
    capability: "to get file metadata and text content from Google Drive",
    category: "integration",
    label: "gdrive_get_file",
  },
  gdrive_create_folder: {
    capability: "to create a new folder in Google Drive",
    category: "integration",
    label: "gdrive_create_folder",
  },
  gdrive_upload: {
    capability: "to upload a local file to Google Drive",
    category: "integration",
    label: "gdrive_upload",
  },
  gdrive_download: {
    capability: "to download a Google Drive file to the local filesystem",
    category: "integration",
    label: "gdrive_download",
  },
  gdrive_move: {
    capability: "to move a file to a different folder in Google Drive",
    category: "integration",
    label: "gdrive_move",
  },
  gdrive_rename: {
    capability: "to rename a file in Google Drive",
    category: "integration",
    label: "gdrive_rename",
  },
  gdrive_trash: {
    capability: "to move a Google Drive file to trash",
    category: "integration",
    label: "gdrive_trash",
  },
  gdrive_share: {
    capability: "to share a Google Drive file with another user",
    category: "integration",
    label: "gdrive_share",
  },
  gh_search_repos: {
    capability: "to search GitHub repositories",
    category: "integration",
    label: "gh_search_repos",
  },
  gh_list_repos: {
    capability: "to list your GitHub repositories",
    category: "integration",
    label: "gh_list_repos",
  },
  gh_get_repo: {
    capability: "to get details of a GitHub repository",
    category: "integration",
    label: "gh_get_repo",
  },
  gh_list_issues: {
    capability: "to list issues in a GitHub repository",
    category: "integration",
    label: "gh_list_issues",
  },
  gh_get_issue: {
    capability: "to get details of a GitHub issue",
    category: "integration",
    label: "gh_get_issue",
  },
  gh_create_issue: {
    capability: "to create a new GitHub issue",
    category: "integration",
    label: "gh_create_issue",
  },
  gh_update_issue: {
    capability: "to update a GitHub issue",
    category: "integration",
    label: "gh_update_issue",
  },
  gh_close_issue: {
    capability: "to close a GitHub issue",
    category: "integration",
    label: "gh_close_issue",
  },
  gh_add_issue_comment: {
    capability: "to add a comment to a GitHub issue",
    category: "integration",
    label: "gh_add_issue_comment",
  },
  gh_list_prs: {
    capability: "to list pull requests in a GitHub repository",
    category: "integration",
    label: "gh_list_prs",
  },
  gh_get_pr: {
    capability: "to get details of a GitHub pull request",
    category: "integration",
    label: "gh_get_pr",
  },
  gh_create_pr: {
    capability: "to create a new GitHub pull request",
    category: "integration",
    label: "gh_create_pr",
  },
  gh_merge_pr: {
    capability: "to merge a GitHub pull request",
    category: "integration",
    label: "gh_merge_pr",
  },
  gh_review_pr: {
    capability: "to review a GitHub pull request",
    category: "integration",
    label: "gh_review_pr",
  },
  gh_add_pr_comment: {
    capability: "to add a comment to a GitHub pull request",
    category: "integration",
    label: "gh_add_pr_comment",
  },
  gh_search_code: {
    capability: "to search code across GitHub repositories",
    category: "integration",
    label: "gh_search_code",
  },
  gh_list_branches: {
    capability: "to list branches in a GitHub repository",
    category: "integration",
    label: "gh_list_branches",
  },
  gh_create_branch: {
    capability: "to create a new branch in a GitHub repository",
    category: "integration",
    label: "gh_create_branch",
  },
  gh_list_runs: {
    capability: "to list GitHub Actions workflow runs",
    category: "integration",
    label: "gh_list_runs",
  },
  gh_get_run_logs: {
    capability: "to get GitHub Actions workflow run logs",
    category: "integration",
    label: "gh_get_run_logs",
  },
  gh_rerun_workflow: {
    capability: "to re-run a GitHub Actions workflow",
    category: "integration",
    label: "gh_rerun_workflow",
  },
  gh_list_releases: {
    capability: "to list releases in a GitHub repository",
    category: "integration",
    label: "gh_list_releases",
  },
  gh_create_release: {
    capability: "to create a new GitHub release",
    category: "integration",
    label: "gh_create_release",
  },
  linear_search_issues: {
    capability: "to search Linear issues by text query",
    category: "integration",
    label: "linear_search_issues",
  },
  linear_list_issues: {
    capability: "to list Linear issues with filters",
    category: "integration",
    label: "linear_list_issues",
  },
  linear_get_issue: {
    capability: "to get details of a Linear issue",
    category: "integration",
    label: "linear_get_issue",
  },
  linear_create_issue: {
    capability: "to create a new Linear issue",
    category: "integration",
    label: "linear_create_issue",
  },
  linear_update_issue: {
    capability: "to update a Linear issue",
    category: "integration",
    label: "linear_update_issue",
  },
  linear_delete_issue: {
    capability: "to delete a Linear issue",
    category: "integration",
    label: "linear_delete_issue",
  },
  linear_list_comments: {
    capability: "to list comments on a Linear issue",
    category: "integration",
    label: "linear_list_comments",
  },
  linear_create_comment: {
    capability: "to add a comment to a Linear issue",
    category: "integration",
    label: "linear_create_comment",
  },
  linear_list_projects: {
    capability: "to list Linear projects",
    category: "integration",
    label: "linear_list_projects",
  },
  linear_get_project: {
    capability: "to get details of a Linear project",
    category: "integration",
    label: "linear_get_project",
  },
  linear_create_project: {
    capability: "to create a new Linear project",
    category: "integration",
    label: "linear_create_project",
  },
  linear_update_project: {
    capability: "to update a Linear project",
    category: "integration",
    label: "linear_update_project",
  },
  linear_list_teams: {
    capability: "to list Linear teams",
    category: "integration",
    label: "linear_list_teams",
  },
  linear_get_team: {
    capability: "to get details of a Linear team",
    category: "integration",
    label: "linear_get_team",
  },
  linear_list_cycles: {
    capability: "to list cycles for a Linear team",
    category: "integration",
    label: "linear_list_cycles",
  },
  linear_get_current_cycle: {
    capability: "to get the current active cycle for a Linear team",
    category: "integration",
    label: "linear_get_current_cycle",
  },
  linear_list_labels: {
    capability: "to list issue labels in Linear",
    category: "integration",
    label: "linear_list_labels",
  },
  linear_create_label: {
    capability: "to create a new issue label in Linear",
    category: "integration",
    label: "linear_create_label",
  },
  linear_list_users: {
    capability: "to list users in the Linear workspace",
    category: "integration",
    label: "linear_list_users",
  },
  linear_list_workflow_states: {
    capability: "to list workflow states for a Linear team",
    category: "integration",
    label: "linear_list_workflow_states",
  },

  // Notion
  notion_search: {
    capability: "to search Notion pages and databases by query",
    category: "integration",
    label: "notion_search",
  },
  notion_get_page: {
    capability: "to get a Notion page by ID with its properties",
    category: "integration",
    label: "notion_get_page",
  },
  notion_create_page: {
    capability: "to create a new Notion page",
    category: "integration",
    label: "notion_create_page",
  },
  notion_update_page: {
    capability: "to update a Notion page's properties or icon",
    category: "integration",
    label: "notion_update_page",
  },
  notion_archive_page: {
    capability: "to archive a Notion page",
    category: "integration",
    label: "notion_archive_page",
  },
  notion_list_databases: {
    capability: "to list accessible Notion databases",
    category: "integration",
    label: "notion_list_databases",
  },
  notion_query_database: {
    capability: "to query a Notion database with filters and sorts",
    category: "integration",
    label: "notion_query_database",
  },
  notion_create_database_entry: {
    capability: "to create a new entry in a Notion database",
    category: "integration",
    label: "notion_create_database_entry",
  },
  notion_update_database_entry: {
    capability: "to update a Notion database entry's properties",
    category: "integration",
    label: "notion_update_database_entry",
  },
  notion_get_blocks: {
    capability: "to get content blocks of a Notion page or block",
    category: "integration",
    label: "notion_get_blocks",
  },
  notion_append_blocks: {
    capability: "to append content blocks to a Notion page",
    category: "integration",
    label: "notion_append_blocks",
  },
  notion_list_comments: {
    capability: "to list comments on a Notion page",
    category: "integration",
    label: "notion_list_comments",
  },
  notion_create_comment: {
    capability: "to create a comment on a Notion page",
    category: "integration",
    label: "notion_create_comment",
  },
  notion_list_users: {
    capability: "to list workspace members in Notion",
    category: "integration",
    label: "notion_list_users",
  },
  notion_get_user: {
    capability: "to get a specific Notion user by ID",
    category: "integration",
    label: "notion_get_user",
  },

  // Airtable
  airtable_list_bases: {
    capability: "to list all accessible Airtable bases",
    category: "integration",
    label: "airtable_list_bases",
  },
  airtable_list_tables: {
    capability: "to list tables in an Airtable base with fields and views",
    category: "integration",
    label: "airtable_list_tables",
  },
  airtable_get_table: {
    capability: "to get detailed schema of a specific Airtable table",
    category: "integration",
    label: "airtable_get_table",
  },
  airtable_create_table: {
    capability: "to create a new table in an Airtable base",
    category: "integration",
    label: "airtable_create_table",
  },
  airtable_create_field: {
    capability: "to add a new field to an Airtable table",
    category: "integration",
    label: "airtable_create_field",
  },
  airtable_update_field: {
    capability: "to update a field's name or description in an Airtable table",
    category: "integration",
    label: "airtable_update_field",
  },
  airtable_list_records: {
    capability: "to list and filter records in an Airtable table",
    category: "integration",
    label: "airtable_list_records",
  },
  airtable_get_record: {
    capability: "to get a single record from an Airtable table",
    category: "integration",
    label: "airtable_get_record",
  },
  airtable_create_records: {
    capability: "to create records in an Airtable table",
    category: "integration",
    label: "airtable_create_records",
  },
  airtable_update_records: {
    capability: "to update existing records in an Airtable table",
    category: "integration",
    label: "airtable_update_records",
  },
  airtable_delete_records: {
    capability: "to delete records from an Airtable table",
    category: "integration",
    label: "airtable_delete_records",
  },
  airtable_list_comments: {
    capability: "to list comments on an Airtable record",
    category: "integration",
    label: "airtable_list_comments",
  },
  airtable_create_comment: {
    capability: "to add a comment to an Airtable record",
    category: "integration",
    label: "airtable_create_comment",
  },
  airtable_get_user: {
    capability: "to get the current Airtable user's identity",
    category: "integration",
    label: "airtable_get_user",
  },

  // Slack
  slack_list_channels: {
    capability: "to list Slack channels in the workspace",
    category: "integration",
    label: "slack_list_channels",
  },
  slack_get_channel: {
    capability: "to get details of a Slack channel",
    category: "integration",
    label: "slack_get_channel",
  },
  slack_create_channel: {
    capability: "to create a new Slack channel",
    category: "integration",
    label: "slack_create_channel",
  },
  slack_archive_channel: {
    capability: "to archive a Slack channel",
    category: "integration",
    label: "slack_archive_channel",
  },
  slack_invite_to_channel: {
    capability: "to invite users to a Slack channel",
    category: "integration",
    label: "slack_invite_to_channel",
  },
  slack_kick_from_channel: {
    capability: "to remove a user from a Slack channel",
    category: "integration",
    label: "slack_kick_from_channel",
  },
  slack_set_topic: {
    capability: "to set a Slack channel topic",
    category: "integration",
    label: "slack_set_topic",
  },
  slack_set_purpose: {
    capability: "to set a Slack channel purpose",
    category: "integration",
    label: "slack_set_purpose",
  },
  slack_search_messages: {
    capability: "to search Slack messages across the workspace",
    category: "integration",
    label: "slack_search_messages",
  },
  slack_post_message: {
    capability: "to post a message to a Slack channel",
    category: "integration",
    label: "slack_post_message",
  },
  slack_reply_to_thread: {
    capability: "to reply to a Slack message thread",
    category: "integration",
    label: "slack_reply_to_thread",
  },
  slack_update_message: {
    capability: "to update a Slack message",
    category: "integration",
    label: "slack_update_message",
  },
  slack_delete_message: {
    capability: "to delete a Slack message",
    category: "integration",
    label: "slack_delete_message",
  },
  slack_add_reaction: {
    capability: "to add an emoji reaction to a Slack message",
    category: "integration",
    label: "slack_add_reaction",
  },
  slack_schedule_message: {
    capability: "to schedule a Slack message for later",
    category: "integration",
    label: "slack_schedule_message",
  },
  slack_pin_message: {
    capability: "to pin a message in a Slack channel",
    category: "integration",
    label: "slack_pin_message",
  },
  slack_unpin_message: {
    capability: "to unpin a message in a Slack channel",
    category: "integration",
    label: "slack_unpin_message",
  },
  slack_get_thread: {
    capability: "to get replies in a Slack message thread",
    category: "integration",
    label: "slack_get_thread",
  },
  slack_list_users: {
    capability: "to list Slack workspace members",
    category: "integration",
    label: "slack_list_users",
  },
  slack_get_user: {
    capability: "to get details of a Slack user",
    category: "integration",
    label: "slack_get_user",
  },
  slack_get_history: {
    capability: "to get message history from a Slack channel",
    category: "integration",
    label: "slack_get_history",
  },

  // PostgreSQL
  pg_list_databases: {
    capability: "to list databases on the PostgreSQL server",
    category: "integration",
    label: "pg_list_databases",
  },
  pg_list_schemas: {
    capability: "to list schemas in a PostgreSQL database",
    category: "integration",
    label: "pg_list_schemas",
  },
  pg_list_tables: {
    capability: "to list tables in a PostgreSQL schema",
    category: "integration",
    label: "pg_list_tables",
  },
  pg_describe_table: {
    capability:
      "to describe a PostgreSQL table's columns, indexes, and foreign keys",
    category: "integration",
    label: "pg_describe_table",
  },
  pg_query: {
    capability: "to execute a read-only SQL query on PostgreSQL",
    category: "integration",
    label: "pg_query",
  },
  pg_execute: {
    capability:
      "to execute a mutation SQL statement (INSERT/UPDATE/DELETE/DDL) on PostgreSQL",
    category: "integration",
    label: "pg_execute",
  },

  // MySQL
  mysql_list_databases: {
    capability: "to list databases on the MySQL server",
    category: "integration",
    label: "mysql_list_databases",
  },
  mysql_list_tables: {
    capability: "to list tables in a MySQL database",
    category: "integration",
    label: "mysql_list_tables",
  },
  mysql_describe_table: {
    capability:
      "to describe a MySQL table's columns, indexes, and foreign keys",
    category: "integration",
    label: "mysql_describe_table",
  },
  mysql_query: {
    capability: "to execute a read-only SQL query on MySQL",
    category: "integration",
    label: "mysql_query",
  },
  mysql_execute: {
    capability:
      "to execute a mutation SQL statement (INSERT/UPDATE/DELETE/DDL) on MySQL",
    category: "integration",
    label: "mysql_execute",
  },

  // MongoDB
  mongo_list_databases: {
    capability: "to list databases on the MongoDB server",
    category: "integration",
    label: "mongo_list_databases",
  },
  mongo_list_collections: {
    capability: "to list collections in a MongoDB database",
    category: "integration",
    label: "mongo_list_collections",
  },
  mongo_find: {
    capability:
      "to find documents in a MongoDB collection with query, sort, and projection",
    category: "integration",
    label: "mongo_find",
  },
  mongo_find_one: {
    capability: "to find a single document in a MongoDB collection",
    category: "integration",
    label: "mongo_find_one",
  },
  mongo_insert_one: {
    capability: "to insert a document into a MongoDB collection",
    category: "integration",
    label: "mongo_insert_one",
  },
  mongo_insert_many: {
    capability: "to insert multiple documents into a MongoDB collection",
    category: "integration",
    label: "mongo_insert_many",
  },
  mongo_update_one: {
    capability: "to update a single document in a MongoDB collection",
    category: "integration",
    label: "mongo_update_one",
  },
  mongo_update_many: {
    capability: "to update multiple documents in a MongoDB collection",
    category: "integration",
    label: "mongo_update_many",
  },
  mongo_aggregate: {
    capability: "to run an aggregation pipeline on a MongoDB collection",
    category: "integration",
    label: "mongo_aggregate",
  },
  mongo_count: {
    capability: "to count documents in a MongoDB collection",
    category: "integration",
    label: "mongo_count",
  },
  mongo_distinct: {
    capability: "to get distinct values for a field in a MongoDB collection",
    category: "integration",
    label: "mongo_distinct",
  },

  // Yahoo Finance
  yfinance_get_quote: {
    capability:
      "to get real-time stock quotes with price, change, volume, and market cap",
    category: "integration",
    label: "yfinance_get_quote",
  },
  yfinance_search: {
    capability:
      "to search Yahoo Finance for stocks, ETFs, and other securities",
    category: "integration",
    label: "yfinance_search",
  },
  yfinance_get_chart: {
    capability: "to get historical OHLCV price data for a stock",
    category: "integration",
    label: "yfinance_get_chart",
  },

  // ArXiv
  arxiv_search: {
    capability:
      "to search arXiv for academic papers by keyword, author, or category",
    category: "integration",
    label: "arxiv_search",
  },
  arxiv_get_paper: {
    capability: "to get full details of a specific arXiv paper by ID",
    category: "integration",
    label: "arxiv_get_paper",
  },

  // PubMed
  pubmed_search: {
    capability:
      "to search PubMed for biomedical and life science articles",
    category: "integration",
    label: "pubmed_search",
  },
  pubmed_get_article: {
    capability: "to get full details of a specific PubMed article by PMID",
    category: "integration",
    label: "pubmed_get_article",
  },
};

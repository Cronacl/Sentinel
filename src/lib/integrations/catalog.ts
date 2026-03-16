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
};

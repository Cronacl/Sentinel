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
};

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
import { GCalEventsTool } from "./renderers/integrations/gcal/gcal-events";
import { GCalEventDetailTool } from "./renderers/integrations/gcal/gcal-event-detail";
import { GCalCreateEventTool } from "./renderers/integrations/gcal/gcal-create-event";
import { GCalListCalendarsTool } from "./renderers/integrations/gcal/gcal-list-calendars";
import { GCalDeleteEventTool } from "./renderers/integrations/gcal/gcal-delete-event";
import { GCalFreeBusyTool } from "./renderers/integrations/gcal/gcal-free-busy";
import { IntegrationGenericTool } from "./renderers/integrations/shared/generic";

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

  gcal_list_calendars: GCalListCalendarsTool,
  gcal_get_events: GCalEventsTool,
  gcal_get_event: GCalEventDetailTool,
  gcal_create_event: GCalCreateEventTool,
  gcal_update_event: GCalCreateEventTool,
  gcal_delete_event: GCalDeleteEventTool,
  gcal_get_free_busy: GCalFreeBusyTool,
};

function isIntegrationToolName(name: string) {
  return name.startsWith("gmail_") || name.startsWith("gcal_");
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

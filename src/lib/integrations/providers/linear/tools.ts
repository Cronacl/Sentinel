import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { LinearService } from "./service";

function getLinearService(context: IntegrationContext): LinearService {
  const token = context.tokens.linear;
  if (!token) {
    throw new Error(
      "Linear is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new LinearService(token);
}

const issueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  stateName: z.string(),
  stateType: z.string(),
  priority: z.number(),
  priorityLabel: z.string(),
  labels: z.array(z.string()),
  assigneeName: z.string(),
  creatorName: z.string(),
  teamName: z.string(),
  projectName: z.string(),
  estimate: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  url: z.string(),
  userName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  state: z.string(),
  progress: z.number(),
  targetDate: z.string().nullable(),
  startDate: z.string().nullable(),
  leadName: z.string(),
  memberCount: z.number(),
  issueCount: z.number(),
  completedIssueCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  description: z.string(),
  issueCount: z.number(),
  memberCount: z.number(),
  color: z.string(),
  icon: z.string().nullable(),
  createdAt: z.string(),
});

const cycleSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  number: z.number(),
  startsAt: z.string(),
  endsAt: z.string(),
  progress: z.number(),
  issueCountCompleted: z.number(),
  issueCountTotal: z.number(),
  scopeCompleted: z.number(),
  scopeTotal: z.number(),
});

const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  description: z.string(),
  isGroup: z.boolean(),
  parentName: z.string().nullable(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  active: z.boolean(),
  admin: z.boolean(),
});

const workflowStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  color: z.string(),
  position: z.number(),
  teamName: z.string(),
});

export function buildLinearTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    linear_search_issues: withToolApproval(
      tool({
        description:
          "Search Linear issues by text query. Returns matching issues across all teams.",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe("Search query text (at least 1 character)"),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 20)"),
        }),
        outputSchema: z.object({
          issues: z.array(issueSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.searchIssues(input);
        },
      }),
      () => approvalFn("linear_search_issues"),
    ),

    linear_list_issues: withToolApproval(
      tool({
        description:
          "List Linear issues with optional filters for team, project, assignee, or status type.",
        inputSchema: z.object({
          teamId: z.string().optional().describe("Filter by team ID"),
          projectId: z.string().optional().describe("Filter by project ID"),
          assigneeId: z
            .string()
            .optional()
            .describe("Filter by assignee user ID"),
          stateType: z
            .enum([
              "triage",
              "backlog",
              "unstarted",
              "started",
              "completed",
              "cancelled",
            ])
            .optional()
            .describe("Filter by workflow state type"),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 25)"),
        }),
        outputSchema: z.object({ issues: z.array(issueSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const issues = await svc.listIssues(input);
          return { issues };
        },
      }),
      () => approvalFn("linear_list_issues"),
    ),

    linear_get_issue: withToolApproval(
      tool({
        description: "Get a single Linear issue by its ID.",
        inputSchema: z.object({
          issueId: z.string().describe("The issue ID (UUID)"),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.getIssue(input.issueId);
        },
      }),
      () => approvalFn("linear_get_issue"),
    ),

    linear_create_issue: withToolApproval(
      tool({
        description: "Create a new Linear issue in the specified team.",
        inputSchema: z.object({
          teamId: z.string().describe("Team ID to create the issue in"),
          title: z.string().describe("Issue title"),
          description: z
            .string()
            .optional()
            .describe("Issue description (markdown)"),
          assigneeId: z.string().optional().describe("Assignee user ID"),
          priority: z
            .number()
            .min(0)
            .max(4)
            .optional()
            .describe("Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"),
          labelIds: z
            .array(z.string())
            .optional()
            .describe("Label IDs to apply"),
          projectId: z.string().optional().describe("Project ID to associate"),
          stateId: z.string().optional().describe("Workflow state ID"),
          estimate: z.number().optional().describe("Estimate points"),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.createIssue(input);
        },
      }),
      () => approvalFn("linear_create_issue"),
    ),

    linear_update_issue: withToolApproval(
      tool({
        description: "Update an existing Linear issue.",
        inputSchema: z.object({
          issueId: z.string().describe("The issue ID to update"),
          title: z.string().optional().describe("New title"),
          description: z.string().optional().describe("New description"),
          assigneeId: z.string().optional().describe("New assignee user ID"),
          priority: z
            .number()
            .min(0)
            .max(4)
            .optional()
            .describe("New priority"),
          stateId: z.string().optional().describe("New workflow state ID"),
          labelIds: z.array(z.string()).optional().describe("New label IDs"),
          projectId: z.string().optional().describe("New project ID"),
          estimate: z.number().optional().describe("New estimate points"),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const { issueId, ...params } = input;
          const svc = getLinearService(context);
          return svc.updateIssue(issueId, params);
        },
      }),
      () => approvalFn("linear_update_issue"),
    ),

    linear_delete_issue: withToolApproval(
      tool({
        description: "Permanently delete a Linear issue.",
        inputSchema: z.object({
          issueId: z.string().describe("The issue ID to delete"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.deleteIssue(input.issueId);
        },
      }),
      () => approvalFn("linear_delete_issue"),
    ),

    linear_list_comments: withToolApproval(
      tool({
        description: "List comments on a Linear issue.",
        inputSchema: z.object({
          issueId: z.string().describe("The issue ID"),
        }),
        outputSchema: z.object({ comments: z.array(commentSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const comments = await svc.listComments(input.issueId);
          return { comments };
        },
      }),
      () => approvalFn("linear_list_comments"),
    ),

    linear_create_comment: withToolApproval(
      tool({
        description: "Add a comment to a Linear issue.",
        inputSchema: z.object({
          issueId: z.string().describe("The issue ID to comment on"),
          body: z.string().describe("Comment body (markdown)"),
        }),
        outputSchema: commentSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.createComment(input);
        },
      }),
      () => approvalFn("linear_create_comment"),
    ),

    linear_list_projects: withToolApproval(
      tool({
        description: "List Linear projects in the workspace.",
        inputSchema: z.object({
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 25)"),
        }),
        outputSchema: z.object({ projects: z.array(projectSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const projects = await svc.listProjects(input);
          return { projects };
        },
      }),
      () => approvalFn("linear_list_projects"),
    ),

    linear_get_project: withToolApproval(
      tool({
        description: "Get a single Linear project by ID.",
        inputSchema: z.object({
          projectId: z.string().describe("The project ID"),
        }),
        outputSchema: projectSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.getProject(input.projectId);
        },
      }),
      () => approvalFn("linear_get_project"),
    ),

    linear_create_project: withToolApproval(
      tool({
        description: "Create a new Linear project.",
        inputSchema: z.object({
          name: z.string().describe("Project name"),
          description: z.string().optional().describe("Project description"),
          teamIds: z.array(z.string()).describe("Team IDs for this project"),
          targetDate: z
            .string()
            .optional()
            .describe("Target date (ISO string)"),
          startDate: z.string().optional().describe("Start date (ISO string)"),
          leadId: z.string().optional().describe("Lead user ID"),
        }),
        outputSchema: projectSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.createProject(input);
        },
      }),
      () => approvalFn("linear_create_project"),
    ),

    linear_update_project: withToolApproval(
      tool({
        description: "Update an existing Linear project.",
        inputSchema: z.object({
          projectId: z.string().describe("The project ID to update"),
          name: z.string().optional().describe("New name"),
          description: z.string().optional().describe("New description"),
          targetDate: z.string().optional().describe("New target date"),
          startDate: z.string().optional().describe("New start date"),
          leadId: z.string().optional().describe("New lead user ID"),
          state: z
            .string()
            .optional()
            .describe(
              "New state (planned, started, paused, completed, cancelled)",
            ),
        }),
        outputSchema: projectSchema,
        execute: async (input) => {
          const { projectId, ...params } = input;
          const svc = getLinearService(context);
          return svc.updateProject(projectId, params);
        },
      }),
      () => approvalFn("linear_update_project"),
    ),

    linear_list_teams: withToolApproval(
      tool({
        description: "List all teams in the Linear workspace.",
        inputSchema: z.object({}),
        outputSchema: z.object({ teams: z.array(teamSchema) }),
        execute: async () => {
          const svc = getLinearService(context);
          const teams = await svc.listTeams();
          return { teams };
        },
      }),
      () => approvalFn("linear_list_teams"),
    ),

    linear_get_team: withToolApproval(
      tool({
        description: "Get details for a specific Linear team.",
        inputSchema: z.object({
          teamId: z.string().describe("The team ID"),
        }),
        outputSchema: teamSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.getTeam(input.teamId);
        },
      }),
      () => approvalFn("linear_get_team"),
    ),

    linear_list_cycles: withToolApproval(
      tool({
        description: "List cycles for a Linear team.",
        inputSchema: z.object({
          teamId: z.string().describe("The team ID"),
        }),
        outputSchema: z.object({ cycles: z.array(cycleSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const cycles = await svc.listCycles(input.teamId);
          return { cycles };
        },
      }),
      () => approvalFn("linear_list_cycles"),
    ),

    linear_get_current_cycle: withToolApproval(
      tool({
        description: "Get the currently active cycle for a Linear team.",
        inputSchema: z.object({
          teamId: z.string().describe("The team ID"),
        }),
        outputSchema: z.object({ cycle: cycleSchema.nullable() }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const cycle = await svc.getCurrentCycle(input.teamId);
          return { cycle };
        },
      }),
      () => approvalFn("linear_get_current_cycle"),
    ),

    linear_list_labels: withToolApproval(
      tool({
        description: "List issue labels, optionally filtered by team.",
        inputSchema: z.object({
          teamId: z.string().optional().describe("Filter by team ID"),
        }),
        outputSchema: z.object({ labels: z.array(labelSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const labels = await svc.listLabels(input.teamId);
          return { labels };
        },
      }),
      () => approvalFn("linear_list_labels"),
    ),

    linear_create_label: withToolApproval(
      tool({
        description: "Create a new issue label in Linear.",
        inputSchema: z.object({
          name: z.string().describe("Label name"),
          color: z.string().optional().describe("Color hex (e.g. #ff0000)"),
          teamId: z.string().optional().describe("Team ID to scope to"),
          description: z.string().optional().describe("Label description"),
        }),
        outputSchema: labelSchema,
        execute: async (input) => {
          const svc = getLinearService(context);
          return svc.createLabel(input);
        },
      }),
      () => approvalFn("linear_create_label"),
    ),

    linear_list_users: withToolApproval(
      tool({
        description: "List all users/members in the Linear workspace.",
        inputSchema: z.object({}),
        outputSchema: z.object({ users: z.array(userSchema) }),
        execute: async () => {
          const svc = getLinearService(context);
          const users = await svc.listUsers();
          return { users };
        },
      }),
      () => approvalFn("linear_list_users"),
    ),

    linear_list_workflow_states: withToolApproval(
      tool({
        description:
          "List workflow states (statuses) for a team. Returns the available states like Backlog, Todo, In Progress, Done, etc.",
        inputSchema: z.object({
          teamId: z.string().describe("The team ID"),
        }),
        outputSchema: z.object({ states: z.array(workflowStateSchema) }),
        execute: async (input) => {
          const svc = getLinearService(context);
          const states = await svc.listWorkflowStates(input.teamId);
          return { states };
        },
      }),
      () => approvalFn("linear_list_workflow_states"),
    ),
  };
}

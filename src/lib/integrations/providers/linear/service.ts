import "server-only";

import { LinearClient } from "@linear/sdk";

export type LnIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  stateName: string;
  stateType: string;
  priority: number;
  priorityLabel: string;
  labels: string[];
  assigneeName: string;
  creatorName: string;
  teamName: string;
  projectName: string;
  estimate: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type LnComment = {
  id: string;
  body: string;
  url: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
};

export type LnProject = {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  progress: number;
  targetDate: string | null;
  startDate: string | null;
  leadName: string;
  memberCount: number;
  issueCount: number;
  completedIssueCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LnTeam = {
  id: string;
  name: string;
  key: string;
  description: string;
  issueCount: number;
  memberCount: number;
  color: string;
  icon: string | null;
  createdAt: string;
};

export type LnCycle = {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  issueCountCompleted: number;
  issueCountTotal: number;
  scopeCompleted: number;
  scopeTotal: number;
};

export type LnLabel = {
  id: string;
  name: string;
  color: string;
  description: string;
  isGroup: boolean;
  parentName: string | null;
};

export type LnUser = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  active: boolean;
  admin: boolean;
};

export type LnWorkflowState = {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
  teamName: string;
};

export class LinearService {
  private client: LinearClient;

  constructor(accessToken: string) {
    this.client = new LinearClient({ accessToken });
  }

  async searchIssues(params: {
    query: string;
    maxResults?: number;
  }): Promise<{ issues: LnIssue[]; totalCount: number }> {
    const q = params.query?.trim();
    if (!q) throw new Error("Search query must not be empty.");

    const result = await this.client.searchIssues(q, {
      first: params.maxResults ?? 20,
    });
    const issues = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.nodes.map((n: any) => this.parseSafeIssue(n)),
    );
    return { issues, totalCount: result.totalCount };
  }

  async listIssues(params: {
    teamId?: string;
    projectId?: string;
    assigneeId?: string;
    stateType?: string;
    maxResults?: number;
  }): Promise<LnIssue[]> {
    const filter: Record<string, unknown> = {};
    if (params.teamId) filter.team = { id: { eq: params.teamId } };
    if (params.projectId) filter.project = { id: { eq: params.projectId } };
    if (params.assigneeId) filter.assignee = { id: { eq: params.assigneeId } };
    if (params.stateType) filter.state = { type: { eq: params.stateType } };

    const result = await this.client.issues({
      first: params.maxResults ?? 25,
      filter,
    });
    return Promise.all(result.nodes.map((n) => this.parseSafeIssue(n)));
  }

  async getIssue(issueId: string): Promise<LnIssue> {
    const issue = await this.client.issue(issueId);
    return this.parseSafeIssue(issue);
  }

  async createIssue(params: {
    teamId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: number;
    labelIds?: string[];
    projectId?: string;
    stateId?: string;
    estimate?: number;
  }): Promise<LnIssue> {
    const clean: Record<string, unknown> = {
      teamId: params.teamId,
      title: params.title,
    };
    for (const [k, v] of Object.entries(params)) {
      if (k === "teamId" || k === "title") continue;
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      clean[k] = v;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = await this.client.createIssue(clean as any);
    const issue = await payload.issue;
    if (!issue) throw new Error("Failed to create issue");
    return this.parseSafeIssue(issue);
  }

  async updateIssue(
    issueId: string,
    params: {
      title?: string;
      description?: string;
      assigneeId?: string;
      priority?: number;
      stateId?: string;
      labelIds?: string[];
      projectId?: string;
      estimate?: number;
    },
  ): Promise<LnIssue> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      clean[k] = v;
    }
    await this.client.updateIssue(issueId, clean);
    return this.getIssue(issueId);
  }

  async deleteIssue(issueId: string): Promise<{ success: boolean }> {
    const payload = await this.client.deleteIssue(issueId);
    return { success: payload.success };
  }

  async listComments(issueId: string): Promise<LnComment[]> {
    const issue = await this.client.issue(issueId);
    const comments = await issue.comments();
    return Promise.all(
      comments.nodes.map(async (c) => {
        const user = await c.user;
        return {
          id: c.id,
          body: c.body,
          url: c.url,
          userName: user?.name ?? "Unknown",
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    );
  }

  async createComment(params: {
    issueId: string;
    body: string;
  }): Promise<LnComment> {
    const payload = await this.client.createComment(params);
    const comment = await payload.comment;
    if (!comment) throw new Error("Failed to create comment");
    const user = await comment.user;
    return {
      id: comment.id,
      body: comment.body,
      url: comment.url,
      userName: user?.name ?? "Unknown",
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  async listProjects(params?: { maxResults?: number }): Promise<LnProject[]> {
    const result = await this.client.projects({
      first: params?.maxResults ?? 25,
    });
    return Promise.all(result.nodes.map((p) => this.parseSafeProject(p)));
  }

  async getProject(projectId: string): Promise<LnProject> {
    const project = await this.client.project(projectId);
    return this.parseSafeProject(project);
  }

  async createProject(params: {
    name: string;
    description?: string;
    teamIds: string[];
    targetDate?: string;
    startDate?: string;
    leadId?: string;
  }): Promise<LnProject> {
    const payload = await this.client.createProject(params);
    const project = await payload.project;
    if (!project) throw new Error("Failed to create project");
    return this.parseSafeProject(project);
  }

  async updateProject(
    projectId: string,
    params: {
      name?: string;
      description?: string;
      targetDate?: string;
      startDate?: string;
      leadId?: string;
      state?: string;
    },
  ): Promise<LnProject> {
    await this.client.updateProject(projectId, params);
    return this.getProject(projectId);
  }

  async listTeams(): Promise<LnTeam[]> {
    const result = await this.client.teams();
    return Promise.all(
      result.nodes.map(async (t) => {
        const [members, issues] = await Promise.all([
          t.members({ first: 1 }),
          t.issues({ first: 1 }),
        ]);
        return {
          id: t.id,
          name: t.name,
          key: t.key,
          description: t.description ?? "",
          issueCount: (issues as any).totalCount ?? issues.nodes.length,
          memberCount: (members as any).totalCount ?? members.nodes.length,
          color: t.color ?? "",
          icon: t.icon ?? null,
          createdAt: t.createdAt.toISOString(),
        };
      }),
    );
  }

  async getTeam(teamId: string): Promise<LnTeam> {
    const t = await this.client.team(teamId);
    const [members, issues] = await Promise.all([
      t.members({ first: 1 }),
      t.issues({ first: 1 }),
    ]);
    return {
      id: t.id,
      name: t.name,
      key: t.key,
      description: t.description ?? "",
      issueCount: (issues as any).totalCount ?? issues.nodes.length,
      memberCount: (members as any).totalCount ?? members.nodes.length,
      color: t.color ?? "",
      icon: t.icon ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async listCycles(teamId: string): Promise<LnCycle[]> {
    const team = await this.client.team(teamId);
    const cycles = await team.cycles();
    return cycles.nodes.map((c) => this.parseCycle(c));
  }

  async getCurrentCycle(teamId: string): Promise<LnCycle | null> {
    const team = await this.client.team(teamId);
    const activeCycle = await team.activeCycle;
    if (!activeCycle) return null;
    return this.parseCycle(activeCycle);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseCycle(c: any): LnCycle {
    return {
      id: c.id,
      name: c.name ?? null,
      number: c.number,
      startsAt: c.startsAt?.toISOString?.() ?? "",
      endsAt: c.endsAt?.toISOString?.() ?? "",
      progress: c.progress ?? 0,
      issueCountCompleted: c.completedIssueCountAfterEachDay?.length ?? 0,
      issueCountTotal: c.issueCountHistory?.length ?? 0,
      scopeCompleted: c.completedScopeHistory?.length ?? 0,
      scopeTotal: c.scopeHistory?.length ?? 0,
    };
  }

  async listLabels(teamId?: string): Promise<LnLabel[]> {
    const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;
    const result = await this.client.issueLabels({ filter });
    return Promise.all(
      result.nodes.map(async (l) => {
        const parent = await l.parent;
        return {
          id: l.id,
          name: l.name,
          color: l.color,
          description: l.description ?? "",
          isGroup: l.isGroup,
          parentName: parent?.name ?? null,
        };
      }),
    );
  }

  async createLabel(params: {
    name: string;
    color?: string;
    teamId?: string;
    description?: string;
  }): Promise<LnLabel> {
    const payload = await this.client.createIssueLabel(params);
    const label = await payload.issueLabel;
    if (!label) throw new Error("Failed to create label");
    const parent = await label.parent;
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? "",
      isGroup: label.isGroup,
      parentName: parent?.name ?? null,
    };
  }

  async listUsers(): Promise<LnUser[]> {
    const result = await this.client.users();
    return result.nodes.map((u) => ({
      id: u.id,
      name: u.name,
      displayName: u.displayName,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      active: u.active,
      admin: u.admin,
    }));
  }

  async listWorkflowStates(teamId: string): Promise<LnWorkflowState[]> {
    const result = await this.client.workflowStates({
      filter: { team: { id: { eq: teamId } } },
    });
    return Promise.all(
      result.nodes.map(async (s) => {
        const team = await s.team;
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          color: s.color,
          position: s.position,
          teamName: team?.name ?? "",
        };
      }),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async parseSafeIssue(node: any): Promise<LnIssue> {
    const [state, assignee, creator, team, project] = await Promise.all([
      node.state,
      node.assignee,
      node.creator,
      node.team,
      node.project,
    ]);

    let labelNames: string[] = [];
    if (typeof node.labels === "function") {
      try {
        const labelsConn = await node.labels();
        labelNames = labelsConn.nodes.map((l: { name: string }) => l.name);
      } catch {
        // Search result nodes may not support labels()
      }
    }

    return {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: (node.description ?? "").slice(0, 3000),
      url: node.url,
      stateName: state?.name ?? "",
      stateType: state?.type ?? "",
      priority: node.priority ?? 0,
      priorityLabel: node.priorityLabel ?? "No priority",
      labels: labelNames,
      assigneeName: assignee?.name ?? "",
      creatorName: creator?.name ?? "",
      teamName: team?.name ?? "",
      projectName: project?.name ?? "",
      estimate: node.estimate ?? null,
      createdAt: node.createdAt?.toISOString?.() ?? "",
      updatedAt: node.updatedAt?.toISOString?.() ?? "",
      completedAt: node.completedAt?.toISOString?.() ?? null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async parseSafeProject(node: any): Promise<LnProject> {
    const lead = node.lead ? await node.lead : null;
    const members =
      typeof node.members === "function" ? await node.members() : { nodes: [] };
    const issues =
      typeof node.issues === "function" ? await node.issues() : { nodes: [] };

    return {
      id: node.id,
      name: node.name,
      description: (node.description ?? "").slice(0, 2000),
      url: node.url,
      state: node.state ?? "",
      progress: node.progress ?? 0,
      targetDate: node.targetDate ?? null,
      startDate: node.startDate ?? null,
      leadName: lead?.name ?? "",
      memberCount: members.nodes?.length ?? 0,
      issueCount: issues.nodes?.length ?? 0,
      completedIssueCount: node.completedIssueCountHistory?.length ?? 0,
      createdAt: node.createdAt?.toISOString?.() ?? "",
      updatedAt: node.updatedAt?.toISOString?.() ?? "",
    };
  }
}

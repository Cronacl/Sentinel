import "server-only";

import { Client } from "@notionhq/client";

export type NtPage = {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  cover: string | null;
  parentType: string;
  parentId: string | null;
  archived: boolean;
  properties: Record<string, string>;
  createdTime: string;
  lastEditedTime: string;
  createdBy: string;
  lastEditedBy: string;
};

export type NtDatabase = {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: string | null;
  archived: boolean;
  propertyNames: string[];
  createdTime: string;
  lastEditedTime: string;
};

export type NtBlock = {
  id: string;
  type: string;
  hasChildren: boolean;
  archived: boolean;
  text: string;
  createdTime: string;
  lastEditedTime: string;
};

export type NtComment = {
  id: string;
  richText: string;
  createdTime: string;
  createdBy: string;
  parentType: string;
};

export type NtUser = {
  id: string;
  name: string;
  type: string;
  avatarUrl: string | null;
  email: string | null;
};

function extractTitle(page: any): string {
  if (!page.properties) return "Untitled";
  for (const prop of Object.values(page.properties) as any[]) {
    if (prop.type === "title" && Array.isArray(prop.title)) {
      return (
        prop.title.map((t: any) => t.plain_text ?? "").join("") || "Untitled"
      );
    }
  }
  return "Untitled";
}

function extractIcon(icon: any): string | null {
  if (!icon) return null;
  if (icon.type === "emoji") return icon.emoji;
  if (icon.type === "external") return icon.external?.url ?? null;
  if (icon.type === "file") return icon.file?.url ?? null;
  return null;
}

function extractCover(cover: any): string | null {
  if (!cover) return null;
  if (cover.type === "external") return cover.external?.url ?? null;
  if (cover.type === "file") return cover.file?.url ?? null;
  return null;
}

function extractParent(parent: any): { type: string; id: string | null } {
  if (!parent) return { type: "unknown", id: null };
  if (parent.type === "database_id")
    return { type: "database", id: parent.database_id };
  if (parent.type === "data_source_id")
    return { type: "database", id: parent.data_source_id ?? parent.database_id };
  if (parent.type === "page_id") return { type: "page", id: parent.page_id };
  if (parent.type === "workspace") return { type: "workspace", id: null };
  if (parent.type === "block_id") return { type: "block", id: parent.block_id };
  return { type: parent.type ?? "unknown", id: null };
}

function extractPropertyValue(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("");
    case "rich_text":
      return (prop.rich_text ?? [])
        .map((t: any) => t.plain_text ?? "")
        .join("");
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "select":
      return prop.select?.name ?? "";
    case "multi_select":
      return (prop.multi_select ?? []).map((s: any) => s.name).join(", ");
    case "date":
      return prop.date?.start
        ? `${prop.date.start}${prop.date.end ? ` to ${prop.date.end}` : ""}`
        : "";
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "people":
      return (prop.people ?? [])
        .map((p: any) => p.name ?? "Unknown")
        .join(", ");
    case "relation":
      return `${(prop.relation ?? []).length} relation(s)`;
    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string ?? "";
      if (prop.formula?.type === "number")
        return String(prop.formula.number ?? "");
      if (prop.formula?.type === "boolean")
        return prop.formula.boolean ? "Yes" : "No";
      if (prop.formula?.type === "date") return prop.formula.date?.start ?? "";
      return "";
    case "rollup":
      if (prop.rollup?.type === "number")
        return String(prop.rollup.number ?? "");
      if (prop.rollup?.type === "array")
        return `${(prop.rollup.array ?? []).length} item(s)`;
      return "";
    case "created_time":
      return prop.created_time ?? "";
    case "last_edited_time":
      return prop.last_edited_time ?? "";
    case "created_by":
      return prop.created_by?.name ?? "";
    case "last_edited_by":
      return prop.last_edited_by?.name ?? "";
    case "files":
      return (prop.files ?? [])
        .map((f: any) => f.name ?? f.external?.url ?? "")
        .join(", ");
    case "unique_id":
      return prop.unique_id
        ? `${prop.unique_id.prefix ?? ""}${prop.unique_id.number ?? ""}`
        : "";
    default:
      return "";
  }
}

function parsePage(raw: any): NtPage {
  const parent = extractParent(raw.parent);
  const properties: Record<string, string> = {};
  if (raw.properties) {
    for (const [key, val] of Object.entries(raw.properties)) {
      const v = extractPropertyValue(val);
      if (v) properties[key] = v;
    }
  }
  return {
    id: raw.id,
    title: extractTitle(raw),
    url: raw.url ?? "",
    icon: extractIcon(raw.icon),
    cover: extractCover(raw.cover),
    parentType: parent.type,
    parentId: parent.id,
    archived: raw.archived ?? false,
    properties,
    createdTime: raw.created_time ?? "",
    lastEditedTime: raw.last_edited_time ?? "",
    createdBy: raw.created_by?.id ?? "",
    lastEditedBy: raw.last_edited_by?.id ?? "",
  };
}

function extractRichText(richText: any[]): string {
  return (richText ?? []).map((t: any) => t.plain_text ?? "").join("");
}

function extractBlockText(block: any): string {
  const data = block[block.type];
  if (!data) return "";
  if (data.rich_text) return extractRichText(data.rich_text);
  if (data.text) return extractRichText(data.text);
  if (data.caption) return extractRichText(data.caption);
  if (data.title) return data.title;
  if (data.url) return data.url;
  if (data.expression) return data.expression;
  return "";
}

export class NotionService {
  private client: Client;

  constructor(accessToken: string) {
    this.client = new Client({ auth: accessToken });
  }

  async search(params: {
    query: string;
    filter?: "page" | "data_source";
    maxResults?: number;
  }): Promise<{ results: (NtPage | NtDatabase)[]; totalCount: number }> {
    const response = await this.client.search({
      query: params.query,
      filter: params.filter
        ? { value: params.filter, property: "object" }
        : undefined,
      page_size: params.maxResults ?? 20,
    });

    const results = response.results.map((r: any) =>
      r.object === "database" || r.object === "data_source"
        ? this.parseDatabase(r)
        : parsePage(r),
    );

    return { results, totalCount: results.length };
  }

  async getPage(pageId: string): Promise<NtPage> {
    const page = await this.client.pages.retrieve({ page_id: pageId });
    return parsePage(page);
  }

  async createPage(params: {
    parentPageId?: string;
    parentDatabaseId?: string;
    title: string;
    properties?: Record<string, unknown>;
    children?: Array<{ type: string; content: string }>;
  }): Promise<NtPage> {
    const parent = params.parentDatabaseId
      ? { data_source_id: params.parentDatabaseId }
      : { page_id: params.parentPageId! };

    const pageProperties: Record<string, unknown> = params.parentDatabaseId
      ? {
          title: { title: [{ text: { content: params.title } }] },
          ...(params.properties ?? {}),
        }
      : { title: { title: [{ text: { content: params.title } }] } };

    const children = (params.children ?? []).map((c) =>
      this.buildBlock(c.type, c.content),
    );

    const page = await this.client.pages.create({
      parent: parent as any,
      properties: pageProperties as any,
      children: children as any,
    });

    return parsePage(page);
  }

  async updatePage(
    pageId: string,
    params: {
      properties?: Record<string, unknown>;
      archived?: boolean;
      icon?: string;
      cover?: string;
    },
  ): Promise<NtPage> {
    const update: Record<string, unknown> = { page_id: pageId };
    if (params.properties) update.properties = params.properties;
    if (params.archived !== undefined) update.archived = params.archived;
    if (params.icon) update.icon = { type: "emoji", emoji: params.icon };
    if (params.cover)
      update.cover = { type: "external", external: { url: params.cover } };

    const page = await this.client.pages.update(update as any);
    return parsePage(page);
  }

  async archivePage(pageId: string): Promise<NtPage> {
    return this.updatePage(pageId, { archived: true });
  }

  async listDatabases(params?: { maxResults?: number }): Promise<NtDatabase[]> {
    const response = await this.client.search({
      filter: { value: "data_source", property: "object" },
      page_size: params?.maxResults ?? 25,
    });
    return response.results.map((r: any) => this.parseDatabase(r));
  }

  async queryDatabase(params: {
    databaseId: string;
    filter?: Record<string, unknown>;
    sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
    maxResults?: number;
  }): Promise<{ entries: NtPage[]; hasMore: boolean }> {
    const query: Record<string, unknown> = {
      data_source_id: params.databaseId,
      page_size: params.maxResults ?? 25,
    };
    if (params.filter) query.filter = params.filter;
    if (params.sorts) query.sorts = params.sorts;

    const response = await this.client.dataSources.query(query as any);
    const entries = response.results.map((r: any) => parsePage(r));
    return { entries, hasMore: response.has_more };
  }

  async createDatabaseEntry(params: {
    databaseId: string;
    properties: Record<string, unknown>;
    children?: Array<{ type: string; content: string }>;
  }): Promise<NtPage> {
    const children = (params.children ?? []).map((c) =>
      this.buildBlock(c.type, c.content),
    );
    const page = await this.client.pages.create({
      parent: { data_source_id: params.databaseId },
      properties: params.properties as any,
      children: children as any,
    });
    return parsePage(page);
  }

  async updateDatabaseEntry(
    pageId: string,
    params: { properties: Record<string, unknown> },
  ): Promise<NtPage> {
    const page = await this.client.pages.update({
      page_id: pageId,
      properties: params.properties as any,
    });
    return parsePage(page);
  }

  async getBlocks(params: {
    blockId: string;
    maxResults?: number;
  }): Promise<NtBlock[]> {
    const response = await this.client.blocks.children.list({
      block_id: params.blockId,
      page_size: params.maxResults ?? 50,
    });
    return response.results.map((b: any) => ({
      id: b.id,
      type: b.type,
      hasChildren: b.has_children ?? false,
      archived: b.archived ?? false,
      text: extractBlockText(b),
      createdTime: b.created_time ?? "",
      lastEditedTime: b.last_edited_time ?? "",
    }));
  }

  async appendBlocks(params: {
    blockId: string;
    children: Array<{ type: string; content: string }>;
  }): Promise<NtBlock[]> {
    const children = params.children.map((c) =>
      this.buildBlock(c.type, c.content),
    );
    const response = await this.client.blocks.children.append({
      block_id: params.blockId,
      children: children as any,
    });
    return response.results.map((b: any) => ({
      id: b.id,
      type: b.type,
      hasChildren: b.has_children ?? false,
      archived: b.archived ?? false,
      text: extractBlockText(b),
      createdTime: b.created_time ?? "",
      lastEditedTime: b.last_edited_time ?? "",
    }));
  }

  async listComments(params: {
    blockId: string;
    maxResults?: number;
  }): Promise<NtComment[]> {
    const response = await this.client.comments.list({
      block_id: params.blockId,
      page_size: params.maxResults ?? 50,
    });
    return response.results.map((c: any) => ({
      id: c.id,
      richText: extractRichText(c.rich_text),
      createdTime: c.created_time ?? "",
      createdBy: c.created_by?.id ?? "",
      parentType: c.parent?.type ?? "",
    }));
  }

  async createComment(params: {
    pageId: string;
    richText: string;
    discussionId?: string;
  }): Promise<NtComment> {
    const body: Record<string, unknown> = {
      rich_text: [{ text: { content: params.richText } }],
    };
    if (params.discussionId) {
      body.discussion_id = params.discussionId;
    } else {
      body.parent = { page_id: params.pageId };
    }
    const comment = await this.client.comments.create(body as any);
    return {
      id: (comment as any).id,
      richText: extractRichText((comment as any).rich_text),
      createdTime: (comment as any).created_time ?? "",
      createdBy: (comment as any).created_by?.id ?? "",
      parentType: (comment as any).parent?.type ?? "",
    };
  }

  async listUsers(params?: { maxResults?: number }): Promise<NtUser[]> {
    const response = await this.client.users.list({
      page_size: params?.maxResults ?? 50,
    });
    return response.results.map((u: any) => ({
      id: u.id,
      name: u.name ?? "",
      type: u.type ?? "",
      avatarUrl: u.avatar_url ?? null,
      email: u.person?.email ?? null,
    }));
  }

  async getUser(userId: string): Promise<NtUser> {
    const u = await this.client.users.retrieve({ user_id: userId });
    return {
      id: u.id,
      name: u.name ?? "",
      type: u.type ?? "",
      avatarUrl: u.avatar_url ?? null,
      email: (u as any).person?.email ?? null,
    };
  }

  private parseDatabase(raw: any): NtDatabase {
    const titleArr = raw.title ?? [];
    const title =
      titleArr.map((t: any) => t.plain_text ?? "").join("") || "Untitled";
    const descArr = raw.description ?? [];
    const description = descArr.map((t: any) => t.plain_text ?? "").join("");
    const propertyNames = raw.properties ? Object.keys(raw.properties) : [];

    return {
      id: raw.id,
      title,
      description,
      url: raw.url ?? "",
      icon: extractIcon(raw.icon),
      archived: raw.archived ?? false,
      propertyNames,
      createdTime: raw.created_time ?? "",
      lastEditedTime: raw.last_edited_time ?? "",
    };
  }

  private buildBlock(type: string, content: string) {
    const richText = [{ text: { content } }];
    switch (type) {
      case "heading_1":
        return {
          object: "block" as const,
          type: "heading_1",
          heading_1: { rich_text: richText },
        };
      case "heading_2":
        return {
          object: "block" as const,
          type: "heading_2",
          heading_2: { rich_text: richText },
        };
      case "heading_3":
        return {
          object: "block" as const,
          type: "heading_3",
          heading_3: { rich_text: richText },
        };
      case "bulleted_list_item":
        return {
          object: "block" as const,
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: richText },
        };
      case "numbered_list_item":
        return {
          object: "block" as const,
          type: "numbered_list_item",
          numbered_list_item: { rich_text: richText },
        };
      case "to_do":
        return {
          object: "block" as const,
          type: "to_do",
          to_do: { rich_text: richText, checked: false },
        };
      case "toggle":
        return {
          object: "block" as const,
          type: "toggle",
          toggle: { rich_text: richText },
        };
      case "callout":
        return {
          object: "block" as const,
          type: "callout",
          callout: { rich_text: richText },
        };
      case "quote":
        return {
          object: "block" as const,
          type: "quote",
          quote: { rich_text: richText },
        };
      case "divider":
        return { object: "block" as const, type: "divider", divider: {} };
      case "code":
        return {
          object: "block" as const,
          type: "code",
          code: { rich_text: richText, language: "plain text" },
        };
      default:
        return {
          object: "block" as const,
          type: "paragraph",
          paragraph: { rich_text: richText },
        };
    }
  }
}

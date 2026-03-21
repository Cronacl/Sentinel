import "server-only";

const META_BASE_URL = "https://api.airtable.com/v0/meta";
const DATA_BASE_URL = "https://api.airtable.com/v0";

export type AtBase = {
  id: string;
  name: string;
  permissionLevel: string;
};

export type AtField = {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
};

export type AtView = {
  id: string;
  name: string;
  type: string;
};

export type AtTable = {
  id: string;
  name: string;
  description?: string;
  fields: AtField[];
  views: AtView[];
  primaryFieldId?: string;
};

export type AtRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

export type AtComment = {
  id: string;
  text: string;
  author: { id: string; email: string; name?: string };
  createdTime: string;
};

export type AtUser = {
  id: string;
  email?: string;
};

export class AirtableService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Airtable API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  async listBases(): Promise<{ bases: AtBase[]; totalCount: number }> {
    const data = await this.request<{
      bases: Array<{ id: string; name: string; permissionLevel: string }>;
    }>(`${META_BASE_URL}/bases`);

    const bases: AtBase[] = (data.bases ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      permissionLevel: b.permissionLevel,
    }));

    return { bases, totalCount: bases.length };
  }

  async listTables(params: {
    baseId: string;
  }): Promise<{ tables: AtTable[]; totalCount: number }> {
    const data = await this.request<{ tables: Array<Record<string, unknown>> }>(
      `${META_BASE_URL}/bases/${params.baseId}/tables`,
    );

    const tables: AtTable[] = (data.tables ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? undefined,
      fields: (t.fields ?? []).map((f: any) => parseField(f)),
      views: (t.views ?? []).map((v: any) => parseView(v)),
      primaryFieldId: t.primaryFieldId ?? undefined,
    }));

    return { tables, totalCount: tables.length };
  }

  async getTable(params: {
    baseId: string;
    tableIdOrName: string;
  }): Promise<AtTable> {
    const { tables } = await this.listTables({ baseId: params.baseId });
    const table = tables.find(
      (t) => t.id === params.tableIdOrName || t.name === params.tableIdOrName,
    );
    if (!table) {
      throw new Error(
        `Table "${params.tableIdOrName}" not found in base ${params.baseId}`,
      );
    }
    return table;
  }

  async createTable(params: {
    baseId: string;
    name: string;
    description?: string;
    fields: Array<{
      name: string;
      type: string;
      description?: string;
      options?: Record<string, unknown>;
    }>;
  }): Promise<AtTable> {
    const body: Record<string, unknown> = {
      name: params.name,
      fields: params.fields,
    };
    if (params.description) body.description = params.description;

    const data = await this.request<Record<string, any>>(
      `${META_BASE_URL}/bases/${params.baseId}/tables`,
      { method: "POST", body: JSON.stringify(body) },
    );

    return {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      fields: (data.fields ?? []).map((f: any) => parseField(f)),
      views: (data.views ?? []).map((v: any) => parseView(v)),
      primaryFieldId: data.primaryFieldId ?? undefined,
    };
  }

  async createField(params: {
    baseId: string;
    tableIdOrName: string;
    name: string;
    type: string;
    description?: string;
    options?: Record<string, unknown>;
  }): Promise<AtField> {
    const tableId = await this.resolveTableId(
      params.baseId,
      params.tableIdOrName,
    );
    const body: Record<string, unknown> = {
      name: params.name,
      type: params.type,
    };
    if (params.description) body.description = params.description;
    if (params.options) body.options = params.options;

    const data = await this.request<Record<string, any>>(
      `${META_BASE_URL}/bases/${params.baseId}/tables/${tableId}/fields`,
      { method: "POST", body: JSON.stringify(body) },
    );

    return parseField(data);
  }

  async updateField(params: {
    baseId: string;
    tableIdOrName: string;
    fieldIdOrName: string;
    name?: string;
    description?: string;
  }): Promise<AtField> {
    const tableId = await this.resolveTableId(
      params.baseId,
      params.tableIdOrName,
    );
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;

    const data = await this.request<Record<string, any>>(
      `${META_BASE_URL}/bases/${params.baseId}/tables/${tableId}/fields/${params.fieldIdOrName}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );

    return parseField(data);
  }

  private async resolveTableId(
    baseId: string,
    tableIdOrName: string,
  ): Promise<string> {
    if (tableIdOrName.startsWith("tbl")) return tableIdOrName;
    const { tables } = await this.listTables({ baseId });
    const match = tables.find(
      (t) => t.id === tableIdOrName || t.name === tableIdOrName,
    );
    if (!match) {
      throw new Error(`Table "${tableIdOrName}" not found in base ${baseId}`);
    }
    return match.id;
  }

  async listRecords(params: {
    baseId: string;
    tableIdOrName: string;
    view?: string;
    fields?: string[];
    filterByFormula?: string;
    sort?: Array<{ field: string; direction?: "asc" | "desc" }>;
    maxRecords?: number;
    pageSize?: number;
  }): Promise<{ records: AtRecord[]; totalCount: number }> {
    const url = new URL(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`,
    );
    if (params.view) url.searchParams.set("view", params.view);
    if (params.filterByFormula)
      url.searchParams.set("filterByFormula", params.filterByFormula);
    if (params.maxRecords)
      url.searchParams.set("maxRecords", String(params.maxRecords));
    if (params.pageSize)
      url.searchParams.set("pageSize", String(params.pageSize));
    if (params.fields) {
      for (const f of params.fields) {
        url.searchParams.append("fields[]", f);
      }
    }
    if (params.sort) {
      params.sort.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        if (s.direction)
          url.searchParams.set(`sort[${i}][direction]`, s.direction);
      });
    }

    const data = await this.request<{ records: Array<Record<string, any>> }>(
      url.toString(),
    );

    const records: AtRecord[] = (data.records ?? []).map((r) => parseRecord(r));
    return { records, totalCount: records.length };
  }

  async getRecord(params: {
    baseId: string;
    tableIdOrName: string;
    recordId: string;
  }): Promise<AtRecord> {
    const data = await this.request<Record<string, any>>(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}/${params.recordId}`,
    );
    return parseRecord(data);
  }

  async createRecords(params: {
    baseId: string;
    tableIdOrName: string;
    records: Array<{ fields: Record<string, unknown> }>;
  }): Promise<{ records: AtRecord[]; totalCount: number }> {
    const data = await this.request<{ records: Array<Record<string, any>> }>(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`,
      {
        method: "POST",
        body: JSON.stringify({ records: params.records }),
      },
    );

    const records = (data.records ?? []).map((r) => parseRecord(r));
    return { records, totalCount: records.length };
  }

  async updateRecords(params: {
    baseId: string;
    tableIdOrName: string;
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  }): Promise<{ records: AtRecord[]; totalCount: number }> {
    const data = await this.request<{ records: Array<Record<string, any>> }>(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ records: params.records }),
      },
    );

    const records = (data.records ?? []).map((r) => parseRecord(r));
    return { records, totalCount: records.length };
  }

  async deleteRecords(params: {
    baseId: string;
    tableIdOrName: string;
    recordIds: string[];
  }): Promise<{ deletedIds: string[]; totalCount: number }> {
    const url = new URL(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}`,
    );
    for (const id of params.recordIds) {
      url.searchParams.append("records[]", id);
    }

    const data = await this.request<{
      records: Array<{ id: string; deleted: boolean }>;
    }>(url.toString(), { method: "DELETE" });

    const deletedIds = (data.records ?? [])
      .filter((r) => r.deleted)
      .map((r) => r.id);
    return { deletedIds, totalCount: deletedIds.length };
  }

  async listComments(params: {
    baseId: string;
    tableIdOrName: string;
    recordId: string;
  }): Promise<{ comments: AtComment[]; totalCount: number }> {
    const data = await this.request<{ comments: Array<Record<string, any>> }>(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}/${params.recordId}/comments`,
    );

    const comments: AtComment[] = (data.comments ?? []).map((c) =>
      parseComment(c),
    );
    return { comments, totalCount: comments.length };
  }

  async createComment(params: {
    baseId: string;
    tableIdOrName: string;
    recordId: string;
    text: string;
  }): Promise<AtComment> {
    const data = await this.request<Record<string, any>>(
      `${DATA_BASE_URL}/${params.baseId}/${encodeURIComponent(params.tableIdOrName)}/${params.recordId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ text: params.text }),
      },
    );

    return parseComment(data);
  }

  async getUser(): Promise<AtUser> {
    const data = await this.request<Record<string, any>>(
      `${META_BASE_URL}/whoami`,
    );

    return {
      id: data.id,
      email: data.email ?? undefined,
    };
  }
}

function parseField(f: any): AtField {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    description: f.description ?? undefined,
    options: f.options ?? undefined,
  };
}

function parseView(v: any): AtView {
  return {
    id: v.id,
    name: v.name,
    type: v.type,
  };
}

function parseRecord(r: any): AtRecord {
  return {
    id: r.id,
    createdTime: r.createdTime,
    fields: r.fields ?? {},
  };
}

function parseComment(c: any): AtComment {
  return {
    id: c.id,
    text: c.text ?? "",
    author: {
      id: c.author?.id ?? "",
      email: c.author?.email ?? "",
      name: c.author?.name ?? undefined,
    },
    createdTime: c.createdTime ?? "",
  };
}

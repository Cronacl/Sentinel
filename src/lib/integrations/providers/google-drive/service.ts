import "server-only";

import { OAuth2Client } from "google-auth-library";
import { drive_v3, google } from "googleapis";
import { Readable } from "node:stream";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  owners: string[];
  webViewLink: string;
  iconLink: string;
  starred: boolean;
  trashed: boolean;
  parents: string[];
  shared: boolean;
};

export type DriveFileContent = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

const STANDARD_FILE_FIELDS =
  "id, name, mimeType, size, createdTime, modifiedTime, owners(displayName, emailAddress), webViewLink, iconLink, starred, trashed, parents, shared";

const GOOGLE_WORKSPACE_EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  "application/vnd.google-apps.document": { mimeType: "text/plain", ext: ".txt" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", ext: ".csv" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.drawing": { mimeType: "image/png", ext: ".png" },
};

function parseFile(file: drive_v3.Schema$File): DriveFile {
  return {
    id: file.id ?? "",
    name: file.name ?? "",
    mimeType: file.mimeType ?? "",
    size: Number(file.size ?? 0),
    createdTime: file.createdTime ?? "",
    modifiedTime: file.modifiedTime ?? "",
    owners: (file.owners ?? []).map(
      (o) => o.displayName ?? o.emailAddress ?? "",
    ),
    webViewLink: file.webViewLink ?? "",
    iconLink: file.iconLink ?? "",
    starred: file.starred ?? false,
    trashed: file.trashed ?? false,
    parents: file.parents ?? [],
    shared: file.shared ?? false,
  };
}

function isGoogleWorkspaceFile(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(accessToken: string) {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: "v3", auth });
  }

  async searchFiles(params: {
    query: string;
    maxResults?: number;
  }): Promise<{ files: DriveFile[]; totalResults: number }> {
    const response = await this.drive.files.list({
      q: `fullText contains '${params.query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: params.maxResults ?? 20,
      fields: `files(${STANDARD_FILE_FIELDS}), nextPageToken`,
      orderBy: "modifiedTime desc",
    });

    const files = (response.data.files ?? []).map(parseFile);
    return { files, totalResults: files.length };
  }

  async listFiles(params?: {
    folderId?: string;
    maxResults?: number;
  }): Promise<{ files: DriveFile[]; totalResults: number }> {
    const folderId = params?.folderId ?? "root";
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: params?.maxResults ?? 50,
      fields: `files(${STANDARD_FILE_FIELDS}), nextPageToken`,
      orderBy: "folder, name",
    });

    const files = (response.data.files ?? []).map(parseFile);
    return { files, totalResults: files.length };
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const response = await this.drive.files.get({
      fileId,
      fields: STANDARD_FILE_FIELDS,
    });
    return parseFile(response.data);
  }

  async getFileTextContent(fileId: string, mimeType: string): Promise<string> {
    if (isGoogleWorkspaceFile(mimeType)) {
      const exportConfig = GOOGLE_WORKSPACE_EXPORT_MAP[mimeType];
      if (!exportConfig) return "";

      const response = await this.drive.files.export(
        { fileId, mimeType: exportConfig.mimeType },
        { responseType: "text" },
      );
      return typeof response.data === "string"
        ? response.data
        : String(response.data);
    }

    if (!mimeType.startsWith("text/") && mimeType !== "application/json") {
      return "";
    }

    const response = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" },
    );
    return typeof response.data === "string"
      ? response.data
      : String(response.data);
  }

  async createFolder(params: {
    name: string;
    parentId?: string;
  }): Promise<DriveFile> {
    const response = await this.drive.files.create({
      requestBody: {
        name: params.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: params.parentId ? [params.parentId] : undefined,
      },
      fields: STANDARD_FILE_FIELDS,
    });
    return parseFile(response.data);
  }

  async uploadFile(params: {
    name: string;
    mimeType: string;
    content: Buffer;
    parentId?: string;
  }): Promise<DriveFile> {
    const response = await this.drive.files.create({
      requestBody: {
        name: params.name,
        parents: params.parentId ? [params.parentId] : undefined,
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.content),
      },
      fields: STANDARD_FILE_FIELDS,
    });
    return parseFile(response.data);
  }

  async downloadFile(fileId: string): Promise<DriveFileContent> {
    const meta = await this.getFile(fileId);

    if (isGoogleWorkspaceFile(meta.mimeType)) {
      const exportConfig = GOOGLE_WORKSPACE_EXPORT_MAP[meta.mimeType];
      if (!exportConfig) {
        throw new Error(
          `Cannot download Google Workspace file of type: ${meta.mimeType}`,
        );
      }

      const response = await this.drive.files.export(
        { fileId, mimeType: exportConfig.mimeType },
        { responseType: "stream" },
      );

      const buffer = await streamToBuffer(response.data as unknown as Readable);
      return {
        name: meta.name + exportConfig.ext,
        mimeType: exportConfig.mimeType,
        buffer,
      };
    }

    const response = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );

    const buffer = await streamToBuffer(response.data as unknown as Readable);
    return { name: meta.name, mimeType: meta.mimeType, buffer };
  }

  async moveFile(
    fileId: string,
    newParentId: string,
  ): Promise<DriveFile> {
    const current = await this.drive.files.get({
      fileId,
      fields: "parents",
    });
    const previousParents = (current.data.parents ?? []).join(",");

    const response = await this.drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents,
      fields: STANDARD_FILE_FIELDS,
    });
    return parseFile(response.data);
  }

  async renameFile(fileId: string, newName: string): Promise<DriveFile> {
    const response = await this.drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: STANDARD_FILE_FIELDS,
    });
    return parseFile(response.data);
  }

  async trashFile(fileId: string): Promise<void> {
    await this.drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });
  }

  async shareFile(params: {
    fileId: string;
    email: string;
    role: "reader" | "commenter" | "writer";
  }): Promise<{ permissionId: string }> {
    const response = await this.drive.permissions.create({
      fileId: params.fileId,
      requestBody: {
        type: "user",
        role: params.role,
        emailAddress: params.email,
      },
      sendNotificationEmail: true,
    });
    return { permissionId: response.data.id ?? "" };
  }
}

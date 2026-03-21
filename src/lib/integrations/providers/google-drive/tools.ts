import { tool } from "ai";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename, dirname, extname } from "node:path";

import type { IntegrationContext } from "../../types";
import { GoogleDriveService } from "./service";

function getDriveService(context: IntegrationContext): GoogleDriveService {
  const token = context.tokens.google_drive;
  if (!token) {
    throw new Error(
      "Google Drive is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new GoogleDriveService(token);
}

const MAX_TEXT_CONTENT_FOR_MODEL = 3000;

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_CONTENT_FOR_MODEL) return text;
  return text.slice(0, MAX_TEXT_CONTENT_FOR_MODEL) + "\n...[truncated]";
}

const MIME_TYPE_MAP: Record<string, string> = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".json": "application/json",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".jsx": "application/javascript",
  ".tsx": "application/typescript",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".md": "text/markdown",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "application/toml",
  ".sh": "application/x-sh",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".java": "text/x-java",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".h": "text/x-c",
};

function detectMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPE_MAP[ext] ?? "application/octet-stream";
}

const driveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  modifiedTime: z.string(),
  owners: z.array(z.string()),
  webViewLink: z.string(),
  starred: z.boolean(),
  shared: z.boolean(),
});

export function buildGoogleDriveTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    gdrive_search: tool({
      description:
        "Search Google Drive files by name, content, or type. Uses Drive search query syntax.",
      inputSchema: z.object({
        query: z.string().describe("Search query string."),
        maxResults: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe("Maximum number of results to return."),
      }),
      outputSchema: z.object({
        files: z.array(driveFileSchema),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("gdrive_search"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          totalResults: output.totalResults,
          files: output.files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            modifiedTime: f.modifiedTime,
          })),
        },
      }),
      execute: async (input) => {
        const service = getDriveService(context);
        return service.searchFiles(input);
      },
    }),

    gdrive_list_files: tool({
      description:
        "List files in a Google Drive folder. Defaults to the root folder.",
      inputSchema: z.object({
        folderId: z
          .string()
          .optional()
          .describe("Folder ID to list. Defaults to root."),
        maxResults: z
          .number()
          .min(1)
          .max(100)
          .default(50)
          .describe("Maximum number of files to return."),
      }),
      outputSchema: z.object({
        files: z.array(driveFileSchema),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("gdrive_list_files"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          totalResults: output.totalResults,
          files: output.files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            modifiedTime: f.modifiedTime,
          })),
        },
      }),
      execute: async (input) => {
        const service = getDriveService(context);
        return service.listFiles(input);
      },
    }),

    gdrive_get_file: tool({
      description:
        "Get metadata and text content of a Google Drive file. Returns file details and, for text-based files, the content.",
      inputSchema: z.object({
        fileId: z.string().describe("The Google Drive file ID."),
      }),
      outputSchema: z.object({
        file: driveFileSchema,
        textContent: z.string().nullable(),
      }),
      needsApproval: () => approvalFn("gdrive_get_file"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          file: {
            id: output.file.id,
            name: output.file.name,
            mimeType: output.file.mimeType,
          },
          textContent: output.textContent
            ? truncateText(output.textContent)
            : null,
        },
      }),
      execute: async (input) => {
        const service = getDriveService(context);
        const file = await service.getFile(input.fileId);
        let textContent: string | null = null;
        try {
          textContent = await service.getFileTextContent(
            input.fileId,
            file.mimeType,
          );
        } catch {
          // Binary files won't have text content
        }
        return { file, textContent: textContent || null };
      },
    }),

    gdrive_create_folder: tool({
      description: "Create a new folder in Google Drive.",
      inputSchema: z.object({
        name: z.string().describe("Name for the new folder."),
        parentFolderId: z
          .string()
          .optional()
          .describe("Parent folder ID. Defaults to root."),
      }),
      outputSchema: z.object({
        folder: driveFileSchema,
      }),
      needsApproval: () => approvalFn("gdrive_create_folder"),
      execute: async (input) => {
        const service = getDriveService(context);
        const folder = await service.createFolder({
          name: input.name,
          parentId: input.parentFolderId,
        });
        return { folder };
      },
    }),

    gdrive_upload: tool({
      description:
        "Upload a local file from the workspace to Google Drive. Reads the file from the local filesystem and uploads it.",
      inputSchema: z.object({
        localPath: z
          .string()
          .describe(
            "Path to the local file to upload (relative to workspace root or absolute).",
          ),
        name: z
          .string()
          .optional()
          .describe(
            "Name for the file in Drive. Defaults to the local filename.",
          ),
        parentFolderId: z
          .string()
          .optional()
          .describe("Drive folder ID to upload into. Defaults to root."),
      }),
      outputSchema: z.object({
        fileId: z.string(),
        name: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
        webViewLink: z.string(),
      }),
      needsApproval: () => approvalFn("gdrive_upload"),
      execute: async (input) => {
        const absolutePath = resolve(process.cwd(), input.localPath);

        if (!existsSync(absolutePath)) {
          throw new Error(`File not found: ${absolutePath}`);
        }

        const content = readFileSync(absolutePath);
        const fileName = input.name ?? basename(absolutePath);
        const mimeType = detectMimeType(fileName);

        const service = getDriveService(context);
        const file = await service.uploadFile({
          name: fileName,
          mimeType,
          content,
          parentId: input.parentFolderId,
        });

        return {
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: content.length,
          webViewLink: file.webViewLink,
        };
      },
    }),

    gdrive_download: tool({
      description:
        "Download a file from Google Drive to the local filesystem. For Google Workspace files (Docs, Sheets, Slides), exports to a compatible format.",
      inputSchema: z.object({
        fileId: z.string().describe("Google Drive file ID to download."),
        localPath: z
          .string()
          .optional()
          .describe(
            "Local path to save the file to. Defaults to ./downloads/{filename}.",
          ),
      }),
      outputSchema: z.object({
        fileName: z.string(),
        localPath: z.string(),
        sizeBytes: z.number(),
        mimeType: z.string(),
      }),
      needsApproval: () => approvalFn("gdrive_download"),
      execute: async (input) => {
        const service = getDriveService(context);
        const { name, mimeType, buffer } = await service.downloadFile(
          input.fileId,
        );

        const outputPath = input.localPath
          ? resolve(process.cwd(), input.localPath)
          : resolve(process.cwd(), "downloads", name);

        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, buffer);

        return {
          fileName: name,
          localPath: outputPath,
          sizeBytes: buffer.length,
          mimeType,
        };
      },
    }),

    gdrive_move: tool({
      description: "Move a file to a different folder in Google Drive.",
      inputSchema: z.object({
        fileId: z.string().describe("The file ID to move."),
        newParentFolderId: z.string().describe("The destination folder ID."),
      }),
      outputSchema: z.object({ file: driveFileSchema }),
      needsApproval: () => approvalFn("gdrive_move"),
      execute: async (input) => {
        const service = getDriveService(context);
        const file = await service.moveFile(
          input.fileId,
          input.newParentFolderId,
        );
        return { file };
      },
    }),

    gdrive_rename: tool({
      description: "Rename a file in Google Drive.",
      inputSchema: z.object({
        fileId: z.string().describe("The file ID to rename."),
        newName: z.string().describe("The new name for the file."),
      }),
      outputSchema: z.object({ file: driveFileSchema }),
      needsApproval: () => approvalFn("gdrive_rename"),
      execute: async (input) => {
        const service = getDriveService(context);
        const file = await service.renameFile(input.fileId, input.newName);
        return { file };
      },
    }),

    gdrive_trash: tool({
      description: "Move a Google Drive file to trash.",
      inputSchema: z.object({
        fileId: z.string().describe("The file ID to trash."),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      needsApproval: () => approvalFn("gdrive_trash"),
      execute: async (input) => {
        const service = getDriveService(context);
        await service.trashFile(input.fileId);
        return { success: true };
      },
    }),

    gdrive_share: tool({
      description:
        "Share a Google Drive file with another user by email address.",
      inputSchema: z.object({
        fileId: z.string().describe("The file ID to share."),
        email: z
          .string()
          .email()
          .describe("Email address of the user to share with."),
        role: z
          .enum(["reader", "commenter", "writer"])
          .describe("Permission role to grant."),
      }),
      outputSchema: z.object({
        permissionId: z.string(),
      }),
      needsApproval: () => approvalFn("gdrive_share"),
      execute: async (input) => {
        const service = getDriveService(context);
        return service.shareFile(input);
      },
    }),
  };
}

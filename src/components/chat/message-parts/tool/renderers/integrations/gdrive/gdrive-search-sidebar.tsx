"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft02Icon,
  File01Icon,
  FolderOpenIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloseButton, ScrollShadow, Separator, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { useRightSidebar } from "@/components/shell/shell-context";

type DriveFileResult = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  owners: string[];
  webViewLink: string;
  starred: boolean;
  shared: boolean;
};

type BreadcrumbEntry = {
  id: string;
  name: string;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

const MIME_ICONS: Record<string, string> = {
  [FOLDER_MIME]: "solar:folder-bold-duotone",
  "application/vnd.google-apps.document": "solar:document-text-bold-duotone",
  "application/vnd.google-apps.spreadsheet": "solar:document-bold-duotone",
  "application/vnd.google-apps.presentation":
    "solar:presentation-graph-bold-duotone",
  "application/pdf": "solar:file-bold-duotone",
  "image/": "solar:gallery-bold-duotone",
  "video/": "solar:video-frame-bold-duotone",
  "audio/": "solar:music-note-bold-duotone",
  "text/": "solar:document-text-bold-duotone",
};

function getFileIcon(mimeType: string): string {
  if (MIME_ICONS[mimeType]) return MIME_ICONS[mimeType];
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (prefix.endsWith("/") && mimeType.startsWith(prefix)) return icon;
  }
  return "solar:file-bold-duotone";
}

function humanizeMimeType(mimeType: string): string {
  if (mimeType === FOLDER_MIME) return "Folder";
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    const type = mimeType.replace("application/vnd.google-apps.", "");
    return `Google ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  }
  const parts = mimeType.split("/");
  if (parts.length === 2) {
    const sub = parts[1]?.replace(/^(vnd\.|x-)/, "").replace(/[.-]/g, " ");
    return (sub ?? "").charAt(0).toUpperCase() + (sub ?? "").slice(1);
  }
  return mimeType;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeDate(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateString;
  }
}

function formatFullDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function isFolder(file: DriveFileResult) {
  return file.mimeType === FOLDER_MIME;
}

function FileIconBadge({ mimeType }: { mimeType: string }) {
  const folder = mimeType === FOLDER_MIME;
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${folder ? "bg-warning/10" : "bg-primary/8"}`}
    >
      <Icon
        icon={getFileIcon(mimeType)}
        className={`h-3.5 w-3.5 ${folder ? "text-warning" : "text-primary/70"}`}
      />
    </div>
  );
}

const FileRow = memo(function FileRow({
  file,
  onSelect,
}: {
  file: DriveFileResult;
  onSelect: (file: DriveFileResult) => void;
}) {
  const folder = isFolder(file);

  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-foreground/4"
    >
      <FileIconBadge mimeType={file.mimeType} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground/90">
            {file.name}
          </span>
          {file.shared ? (
            <Icon
              icon="solar:share-linear"
              className="ml-1 h-3 w-3 shrink-0 text-foreground/25"
            />
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-foreground/30">
            {formatRelativeDate(file.modifiedTime)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-[11.5px] text-foreground/38">
          {humanizeMimeType(file.mimeType)}
          {!folder && file.size > 0 ? ` · ${formatFileSize(file.size)}` : ""}
          {file.owners.length > 0 ? ` · ${file.owners[0]}` : ""}
        </p>
      </div>

      {folder ? (
        <Icon
          icon="solar:alt-arrow-right-linear"
          className="mt-1.5 h-3.5 w-3.5 shrink-0 text-foreground/20 transition-colors group-hover:text-foreground/50"
        />
      ) : null}
    </button>
  );
});

function Breadcrumbs({
  path,
  onNavigate,
}: {
  path: BreadcrumbEntry[];
  onNavigate: (index: number) => void;
}) {
  if (path.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 text-[11px]">
      {path.map((entry, i) => {
        const isLast = i === path.length - 1;
        return (
          <span
            key={entry.id}
            className="inline-flex shrink-0 items-center gap-0.5"
          >
            {i > 0 ? (
              <Icon
                icon="solar:alt-arrow-right-linear"
                className="h-3 w-3 text-foreground/20"
              />
            ) : null}
            {isLast ? (
              <span className="text-foreground/70 font-medium">
                {entry.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i)}
                className="text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
              >
                {entry.name}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SidebarHeader({
  title,
  subtitle,
  canGoBack,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-2">
      {canGoBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl cursor-pointer text-foreground/50 transition-colors bg-background/50 border border-border/20 hover:text-foreground"
          aria-label="Go back"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <IntegrationProviderIcon
          provider="google_drive"
          className="h-4 w-4 shrink-0 ml-2"
        />
      )}

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {title}
      </span>

      {subtitle ? (
        <span className="shrink-0 text-[11px] text-foreground/35">
          {subtitle}
        </span>
      ) : null}

      <CloseButton aria-label="Close sidebar" onPress={onClose} />
    </header>
  );
}

function EmptyState({ isFolder: isFolderView }: { isFolder?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
        <HugeiconsIcon
          icon={FolderOpenIcon}
          size={18}
          strokeWidth={1.6}
          className="text-foreground/30"
        />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium text-foreground/50">
          {isFolderView ? "This folder is empty" : "No files found"}
        </p>
        <p className="mt-0.5 text-[11px] text-foreground/30">
          {isFolderView
            ? "There are no files or folders here."
            : "Try a different search query."}
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size="sm" color="current" className="text-foreground/30" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[12px] font-medium text-danger">
        Failed to load files
      </p>
      <p className="text-[11px] text-foreground/35">{message}</p>
    </div>
  );
}

function FileListView({
  files,
  onSelect,
  isFolderView,
}: {
  files: DriveFileResult[];
  onSelect: (file: DriveFileResult) => void;
  isFolderView?: boolean;
}) {
  if (files.length === 0) return <EmptyState isFolder={isFolderView} />;

  return (
    <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
      <div className="flex flex-col">
        {files.map((file, index) => (
          <div key={file.id}>
            <FileRow file={file} onSelect={onSelect} />
            {index < files.length - 1 ? (
              <Separator className="my-0.5 ml-10" variant="tertiary" />
            ) : null}
          </div>
        ))}
      </div>
    </ScrollShadow>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11.5px]">
      <span className="w-16 shrink-0 text-right text-foreground/35">
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground/60">{value}</span>
    </div>
  );
}

function FileDetailView({ file }: { file: DriveFileResult }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <FileIconBadge mimeType={file.mimeType} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12.5px] font-medium text-foreground">
                {file.name}
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-foreground/30">
                {formatRelativeDate(file.modifiedTime)}
              </span>
            </div>
            <p className="truncate text-[11px] text-foreground/35">
              {humanizeMimeType(file.mimeType)}
            </p>
          </div>
        </div>

        <div className="space-y-0.5">
          <MetaRow label="Type" value={humanizeMimeType(file.mimeType)} />
          {file.size > 0 ? (
            <MetaRow label="Size" value={formatFileSize(file.size)} />
          ) : null}
          <MetaRow label="Modified" value={formatFullDate(file.modifiedTime)} />
          {file.owners.length > 0 ? (
            <MetaRow label="Owner" value={file.owners.join(", ")} />
          ) : null}
          <MetaRow label="Shared" value={file.shared ? "Yes" : "No"} />
        </div>

        <div className="flex items-center gap-1.5">
          {file.starred ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              <Icon icon="solar:star-bold" className="h-2.5 w-2.5" />
              Starred
            </span>
          ) : null}
          {file.shared ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/5 px-2 py-0.5 text-[10px] text-foreground/50">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                size={10}
                strokeWidth={1.8}
              />
              Shared
            </span>
          ) : null}
        </div>
      </div>

      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1 bg-background">
        {file.webViewLink ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
              <HugeiconsIcon
                icon={File01Icon}
                size={18}
                strokeWidth={1.6}
                className="text-foreground/30"
              />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-foreground/50">
                Preview not available here
              </p>
              <a
                href={file.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                <Icon
                  icon="solar:square-arrow-right-up-linear"
                  className="h-3 w-3"
                />
                Open in Google Drive
              </a>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-[12px] text-foreground/35">
              No preview available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type ViewState =
  | { kind: "list" }
  | { kind: "folder"; folderId: string; folderName: string }
  | { kind: "detail"; file: DriveFileResult };

export const GDriveSearchSidebar = memo(function GDriveSearchSidebar({
  query,
  files: initialFiles,
  totalResults: initialTotal,
  isListMode,
}: {
  query?: string;
  files: DriveFileResult[];
  totalResults: number;
  isListMode: boolean;
}) {
  const { close } = useRightSidebar();

  const [navStack, setNavStack] = useState<ViewState[]>([{ kind: "list" }]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    {
      id: "search",
      name: query ? `"${query}"` : isListMode ? "Files" : "Search",
    },
  ]);

  const [folderCache, setFolderCache] = useState<
    Record<string, { files: DriveFileResult[]; total: number }>
  >({});
  const [loadingFolderId, setLoadingFolderId] = useState<string | null>(null);
  const [folderErrors, setFolderErrors] = useState<Record<string, string>>({});

  const currentView = navStack[navStack.length - 1];

  const fetchFolder = useCallback(
    async (folderId: string, signal: AbortSignal) => {
      if (folderCache[folderId]) return;

      setLoadingFolderId(folderId);
      setFolderErrors((prev) => {
        if (!(folderId in prev)) return prev;
        const next = { ...prev };
        delete next[folderId];
        return next;
      });

      try {
        const response = await fetch(
          `/api/integrations/gdrive/files?folderId=${encodeURIComponent(folderId)}`,
          { cache: "no-store", signal },
        );

        const data = (await response.json()) as {
          error?: string;
          files?: DriveFileResult[];
          totalResults?: number;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load folder contents.");
        }

        setFolderCache((prev) => ({
          ...prev,
          [folderId]: {
            files: data.files ?? [],
            total: data.totalResults ?? data.files?.length ?? 0,
          },
        }));
      } catch (error) {
        if (signal.aborted) return;
        setFolderErrors((prev) => ({
          ...prev,
          [folderId]:
            error instanceof Error ? error.message : "Unable to load folder.",
        }));
      } finally {
        if (!signal.aborted) {
          setLoadingFolderId((cur) => (cur === folderId ? null : cur));
        }
      }
    },
    [folderCache],
  );

  useEffect(() => {
    if (currentView?.kind !== "folder") return;

    const controller = new AbortController();
    void fetchFolder(currentView.folderId!, controller.signal);
    return () => controller.abort();
  }, [currentView, fetchFolder]);

  const handleSelectFile = useCallback((file: DriveFileResult) => {
    if (isFolder(file)) {
      setNavStack((prev) => [
        ...prev,
        { kind: "folder", folderId: file.id, folderName: file.name },
      ]);
      setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
    } else {
      setNavStack((prev) => [...prev, { kind: "detail", file }]);
      setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
    }
  }, []);

  const handleBack = useCallback(() => {
    if (navStack.length <= 1) return;
    setNavStack((prev) => prev.slice(0, -1));
    setBreadcrumbs((prev) => prev.slice(0, -1));
  }, [navStack.length]);

  const handleBreadcrumbNavigate = useCallback((index: number) => {
    setNavStack((prev) => prev.slice(0, index + 1));
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  }, []);

  const handleClose = useCallback(() => close(), [close]);

  const headerTitle = (() => {
    if (currentView?.kind === "detail") return currentView?.file?.name ?? "";
    if (currentView?.kind === "folder") return currentView?.folderName ?? "";
    return "Google Drive";
  })();

  const currentFiles = (() => {
    if (currentView?.kind === "list") return initialFiles;
    if (currentView?.kind === "folder") {
      return folderCache[currentView?.folderId!]?.files ?? [];
    }
    return [];
  })();

  const currentTotal = (() => {
    if (currentView?.kind === "list") return initialTotal;
    if (currentView?.kind === "folder") {
      return folderCache[currentView?.folderId!]?.total ?? 0;
    }
    return 0;
  })();

  const isLoading =
    currentView?.kind === "folder" &&
    loadingFolderId === currentView?.folderId &&
    !folderCache[currentView?.folderId!];

  const error =
    currentView?.kind === "folder"
      ? (folderErrors[currentView?.folderId!] ?? null)
      : null;

  const showBreadcrumbs = breadcrumbs.length > 1;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <SidebarHeader
        title={headerTitle}
        subtitle={
          currentView?.kind !== "detail" && !isLoading && !error
            ? `${currentTotal} item${currentTotal !== 1 ? "s" : ""}`
            : undefined
        }
        canGoBack={navStack.length > 1}
        onBack={handleBack}
        onClose={handleClose}
      />

      {showBreadcrumbs && currentView?.kind !== "detail" ? (
        <>
          <Breadcrumbs
            path={breadcrumbs}
            onNavigate={handleBreadcrumbNavigate}
          />
          <Separator variant="tertiary" />
        </>
      ) : (
        <Separator variant="tertiary" />
      )}

      <div className="min-h-0 flex-1">
        {currentView?.kind === "detail" ? (
          <FileDetailView file={currentView?.file!} />
        ) : isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <FileListView
            files={currentFiles}
            onSelect={handleSelectFile}
            isFolderView={currentView?.kind === "folder"}
          />
        )}
      </div>
    </div>
  );
});

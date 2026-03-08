"use client";

import { Button, Spinner } from "@heroui/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Brain02Icon,
  Cancel01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AIProvider } from "@/../generated/prisma";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopFileSelection } from "@/lib/desktop/contracts";
import { PROVIDERS } from "@/lib/ai/providers";
import { api } from "@/trpc/react";

const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico)$/i;

type ComposerAttachment = {
  id: string;
  name: string;
  path: string;
  size?: number;
  mimeType?: string;
  previewUrl?: string;
};

type ChatComposerProps = {
  activeWorkspace?: {
    id: string;
    name: string;
    rootPath?: string | null;
  } | null;
  promptSeed?: string;
  promptSeedKey?: string | number;
  threadId: string;
};

function isImageAttachment(a: ComposerAttachment) {
  if (a.mimeType && IMAGE_MIME_RE.test(a.mimeType)) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(a.name);
}

function getModelKey(provider: AIProvider, modelId: string) {
  return `${provider}:${modelId}`;
}

function SendIcon() {
  return (
    <HugeiconsIcon
      color="currentColor"
      icon={ArrowUp02Icon}
      size={16}
      strokeWidth={1.5}
    />
  );
}

function ImagePreviewModal({
  attachment,
  onClose,
}: {
  attachment: ComposerAttachment;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onClick={onClose}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0 bg-overlay/70 backdrop-blur-sm" />

        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex max-h-[85vh] max-w-[85vw] flex-col items-center gap-3"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={attachment.name}
              className="max-h-[80vh] max-w-[80vw] object-contain"
              src={attachment.previewUrl}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-overlay-foreground/70">
              {attachment.name}
            </span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-default text-foreground transition-colors hover:bg-default-hover"
              onClick={onClose}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Cancel01Icon}
                size={16}
                strokeWidth={2}
              />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
  onPreview,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const isImage = isImageAttachment(attachment);

  return (
    <div
      role="button"
      onClick={isImage && attachment.previewUrl ? onPreview : undefined}
      className="group relative flex max-w-[200px] cursor-pointer items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-xs transition-colors hover:bg-surface"
    >
      <div className="flex shrink-0 items-center justify-center">
        {isImage && attachment.previewUrl ? (
          <div className="h-6 w-6 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="h-full w-full object-cover"
              src={attachment.previewUrl}
            />
          </div>
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-default">
            <HugeiconsIcon
              color="currentColor"
              icon={File01Icon}
              size={12}
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>

      <span className="min-w-0 truncate text-muted">{attachment.name}</span>

      <button
        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-surface text-foreground group-hover:flex"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={Cancel01Icon}
          size={10}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

export function ChatComposer({
  activeWorkspace,
  promptSeed,
  promptSeedKey,
  threadId,
}: ChatComposerProps) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] =
    useState<ComposerAttachment | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelsQuery = api.models.list.useQuery();

  const availableModels = useMemo(
    () =>
      (modelsQuery.data ?? []).filter(
        (model) => model.isConnected && model.isEnabled,
      ),
    [modelsQuery.data],
  );

  const groupedModels = useMemo(() => {
    const groups = new Map<AIProvider, typeof availableModels>();
    for (const model of availableModels) {
      const current = groups.get(model.provider) ?? [];
      current.push(model);
      groups.set(model.provider, current);
    }
    return Array.from(groups.entries());
  }, [availableModels]);

  const selectedModel =
    availableModels.find(
      (model) =>
        getModelKey(model.provider, model.modelId) === selectedModelKey,
    ) ?? null;

  const hasWorkspace = Boolean(activeWorkspace);
  const hasModels = availableModels.length > 0;
  const isLocked = !hasWorkspace || !hasModels;

  const placeholderText = "Ask follow-up changes";

  const editor = useEditor({
    content: {
      content: [{ type: "paragraph" }],
      type: "doc",
    },
    editorProps: {
      attributes: {
        class:
          "sentinel-composer-editor outline-none text-[14px] leading-6 text-foreground",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        const files: File[] = [];
        for (const item of items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }

        if (files.length > 0) {
          addBrowserFiles(files);
          return true;
        }

        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        addBrowserFiles(Array.from(files));
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholderText,
      }),
    ],
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isLocked);

    const placeholderExt = editor.extensionManager.extensions.find(
      (ext) => ext.name === "placeholder",
    );
    if (placeholderExt) {
      placeholderExt.options.placeholder = placeholderText;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, isLocked, placeholderText]);

  useEffect(() => {
    if (availableModels.length === 0) {
      setSelectedModelKey(null);
      return;
    }

    setSelectedModelKey((current) => {
      if (
        current &&
        availableModels.some(
          (m) => getModelKey(m.provider, m.modelId) === current,
        )
      ) {
        return current;
      }

      const first = availableModels[0];
      return first ? getModelKey(first.provider, first.modelId) : null;
    });
  }, [availableModels]);

  useEffect(() => {
    if (!editor || promptSeedKey === undefined) return;

    if (!promptSeed?.trim()) {
      editor.commands.setContent({
        content: [{ type: "paragraph" }],
        type: "doc",
      });
      return;
    }

    editor.commands.setContent({
      content: [
        {
          content: [{ text: promptSeed, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    editor.commands.focus("end");
  }, [editor, promptSeed, promptSeedKey]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        modelMenuRef.current &&
        event.target instanceof Node &&
        !modelMenuRef.current.contains(event.target)
      ) {
        setModelMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(a.previewUrl);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addBrowserFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const newAttachments: ComposerAttachment[] = files.map((f) => {
      const isImage = IMAGE_MIME_RE.test(f.type);
      return {
        id: crypto.randomUUID(),
        name: f.name,
        path: f.name,
        size: f.size,
        mimeType: f.type || undefined,
        previewUrl: isImage ? URL.createObjectURL(f) : undefined,
      };
    });

    setAttachments((current) => [...current, ...newAttachments]);
  }, []);

  const addDesktopFiles = useCallback((files: DesktopFileSelection[]) => {
    if (files.length === 0) return;
    setAttachments((current) => {
      const seenPaths = new Set(current.map((f) => f.path));
      const next = files
        .filter((f) => !seenPaths.has(f.path))
        .map((f) => ({
          ...f,
          id: crypto.randomUUID(),
          previewUrl: undefined,
        }));
      return [...current, ...next];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const removed = current.find((a) => a.id === id);
      if (removed?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((a) => a.id !== id);
    });
  }, []);

  const handlePickFiles = async () => {
    setAttachmentError("");

    const desktop = getDesktopApi();

    if (desktop) {
      try {
        const pickedFiles = await desktop.pickFiles();
        addDesktopFiles(pickedFiles);
      } catch {
        fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    addBrowserFiles(Array.from(fileList));
    e.target.value = "";
  };

  const disabledMessage =
    !modelsQuery.isLoading && !hasModels ? (
      <>
        Connect a provider in{" "}
        <Link className="text-foreground underline" href="/settings/providers">
          Settings
        </Link>
        .
      </>
    ) : null;

  return (
    <>
      <div className="relative rounded-2xl border border-border bg-surface">
        <input
          ref={fileInputRef}
          className="hidden"
          multiple
          onChange={handleFileInputChange}
          type="file"
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((attachment) => (
              <AttachmentChip
                attachment={attachment}
                key={attachment.id}
                onPreview={() => setPreviewAttachment(attachment)}
                onRemove={() => removeAttachment(attachment.id)}
              />
            ))}
          </div>
        )}

        <div className="relative min-h-[44px] px-4 pt-1.5 pb-0.5">
          {!editor ? (
            <div className="pointer-events-none pt-1 text-[14px] leading-6 text-muted opacity-70">
              {placeholderText}
            </div>
          ) : null}
          <EditorContent editor={editor} />
        </div>

        {disabledMessage && (
          <div className="px-4 pb-2">
            <p className="text-xs text-muted">{disabledMessage}</p>
          </div>
        )}

        {attachmentError && (
          <div className="px-4 pb-2">
            <p className="text-danger-soft-foreground text-xs">
              {attachmentError}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center">
            <Button
              isIconOnly
              isDisabled={!hasWorkspace}
              size="sm"
              variant="ghost"
              className="h-6 w-6 min-w-6 min-h-6 rounded-lg"
              onClick={() => void handlePickFiles()}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Add01Icon}
                size={18}
                strokeWidth={1.5}
              />
            </Button>

            <div className="relative" ref={modelMenuRef}>
              <button
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                disabled={!hasModels || modelsQuery.isLoading}
                onClick={() => setModelMenuOpen((o) => !o)}
                type="button"
              >
                {modelsQuery.isLoading ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <span className="max-w-[180px] truncate">
                    {selectedModel?.displayName ?? "No model"}
                  </span>
                )}
                <HugeiconsIcon
                  className={`transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
                  color="currentColor"
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={1.5}
                />
              </button>

              <AnimatePresence>
                {modelMenuOpen && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute bottom-10 left-0 z-30 max-h-[280px] w-[300px] overflow-y-auto rounded-xl border border-border bg-overlay p-1 shadow-overlay backdrop-blur-xl"
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    initial={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {groupedModels.map(([provider, models]) => (
                      <div key={provider}>
                        <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted/60">
                          {PROVIDERS[provider].displayName}
                        </div>

                        {models.map((model) => {
                          const modelKey = getModelKey(
                            model.provider,
                            model.modelId,
                          );
                          const isSelected = selectedModelKey === modelKey;

                          return (
                            <button
                              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-default text-foreground"
                                  : "text-muted hover:bg-default hover:text-foreground"
                              }`}
                              key={modelKey}
                              onClick={() => {
                                setSelectedModelKey(modelKey);
                                setModelMenuOpen(false);
                              }}
                              type="button"
                            >
                              <HugeiconsIcon
                                color="currentColor"
                                icon={Brain02Icon}
                                size={14}
                                strokeWidth={1.5}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium">
                                  {model.displayName}
                                </div>
                                {model.description && (
                                  <div className="truncate text-xs text-muted/60">
                                    {model.description}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Button
            isIconOnly
            isDisabled={isLocked}
            size="sm"
            variant="primary"
            className="h-8 w-8 min-w-8 min-h-8"
          >
            <SendIcon />
          </Button>
        </div>
      </div>

      {previewAttachment && previewAttachment.previewUrl && (
        <ImagePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </>
  );
}

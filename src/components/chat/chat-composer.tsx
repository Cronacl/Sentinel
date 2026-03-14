"use client";

import { Label, Spinner, Switch } from "@heroui/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Add01Icon,
  AiIdeaIcon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileUIPart } from "ai";

import { ProviderIcon } from "@/components/icons/provider-icon";
import type { AIProvider } from "@/server/db/enums";
import {
  getModelAttachmentCapabilities,
  type ReasoningEffort,
  getDefaultReasoningEffort,
  getSupportedReasoningEfforts,
} from "@/lib/ai/providers/models";
import {
  CHAT_ATTACHMENT_ACCEPT,
  getAttachmentIcon,
  getAttachmentTone,
  type AttachmentKind,
} from "@/lib/files/chat-attachment-types";
import {
  getCompositeModelId,
  normalizeSelectedModelId,
} from "@/lib/ai/providers/model-selection";
import { applyThreadSettingsCacheUpdate } from "@/lib/threads/cache";
import { api } from "@/trpc/react";

import {
  convertComposerAttachmentsToFileParts,
  createComposerAttachmentFromFilePart,
  createBrowserAttachments,
  isImageAttachment,
  type ComposerAttachment,
} from "./chat-attachments";
import { AttachmentIcon } from "./attachment-icon";

type ChatComposerProps = {
  activeWorkspace?: {
    id: string;
    name: string;
    rootPath?: string | null;
  } | null;
  onSend?: (input: {
    files?: FileUIPart[];
    modelId: string;
    reasoningEffort?: ReasoningEffort | null;
    text: string;
    threadMode?: "chat" | "plan";
  }) => void;
  onStop?: () => void;
  onCancelEdit?: () => void;
  attachmentSeed?: FileUIPart[];
  isEditing?: boolean;
  promptSeed?: string;
  promptSeedKey?: string | number;
  status?: "submitted" | "streaming" | "ready" | "error";
  draftMode?: "chat" | "plan" | null;
  persistThreadSelection?: boolean;
  threadId?: string;
  threadSelection?: {
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
};

function getReasoningEffortLabel(effort: ReasoningEffort) {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

function resolveReasoningEffort(
  provider: AIProvider,
  modelId: string,
  preferredEffort?: ReasoningEffort | null,
) {
  const supportedEfforts = getSupportedReasoningEfforts(provider, modelId);
  if (supportedEfforts.length === 0) {
    return null;
  }

  if (preferredEffort && supportedEfforts.includes(preferredEffort)) {
    return preferredEffort;
  }

  return getDefaultReasoningEffort(provider, modelId);
}

function getAttachmentKindLabel(kind: AttachmentKind) {
  switch (kind) {
    case "image":
      return "images";
    case "document":
      return "documents";
    case "code-text":
      return "text/code files";
    case "archive":
      return "archives";
    case "audio":
      return "audio files";
    case "video":
      return "video files";
    default:
      return "files";
  }
}

function supportsAttachmentKind(
  kind: AttachmentKind,
  capabilities: ReturnType<typeof getModelAttachmentCapabilities>,
) {
  switch (kind) {
    case "image":
      return capabilities.supportsImages;
    case "document":
      return capabilities.supportsDocuments;
    case "code-text":
      return capabilities.supportsCodeTextFiles;
    default:
      return false;
  }
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
  const attachmentIcon = getAttachmentIcon(attachment.fileType);
  const attachmentTone = getAttachmentTone(attachment.fileType.displayType);

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
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full ${attachmentTone.backgroundClassName} ${attachmentTone.textClassName}`}
          >
            <AttachmentIcon icon={attachmentIcon} size={12} strokeWidth={1.9} />
          </div>
        )}
      </div>
      {!isImage ? (
        <span className="rounded-full bg-default px-1.5 py-0.5 text-[10px] text-muted">
          {attachment.fileType.label}
        </span>
      ) : null}
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
        className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onClick={onClose}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0 bg-overlay/90" />
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

export function ChatComposer({
  activeWorkspace,
  attachmentSeed = [],
  draftMode = null,
  isEditing = false,
  onCancelEdit,
  onSend,
  onStop,
  persistThreadSelection,
  promptSeed,
  promptSeedKey,
  status = "ready",
  threadId,
  threadSelection = null,
}: ChatComposerProps) {
  const utils = api.useUtils();
  const handleSendRef = useRef<() => void>(() => {});
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<ReasoningEffort | null>(null);
  const [previewAttachment, setPreviewAttachment] =
    useState<ComposerAttachment | null>(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const planModeInitScopeRef = useRef<string | null>(null);
  const lastSyncedThreadModeRef = useRef<string | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const threadPersistenceReadyRef = useRef(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const modelsQuery = api.models.list.useQuery();
  const globalSelectionQuery = api.chatPreferences.get.useQuery();
  const initializedSelectionScopeRef = useRef<string | null>(null);
  const updateGlobalSelection = api.chatPreferences.updateGlobal.useMutation({
    onMutate: (input) => {
      const previous = utils.chatPreferences.get.getData();
      utils.chatPreferences.get.setData(undefined, (current) => ({
        mode:
          input.mode !== undefined
            ? (input.mode ?? null)
            : (current?.mode ?? null),
        modelId:
          input.modelId !== undefined
            ? input.modelId
            : (current?.modelId ?? null),
        reasoningEffort:
          input.reasoningEffort !== undefined
            ? (input.reasoningEffort ?? null)
            : (current?.reasoningEffort ?? null),
      }));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.chatPreferences.get.setData(undefined, context.previous);
      }
    },
    onSuccess: (data) => {
      utils.chatPreferences.get.setData(undefined, data);
    },
  });
  const updateThreadSelection = api.threads.updateChatSettings.useMutation({
    onMutate: (input) => {
      applyThreadSettingsCacheUpdate({
        patch: {
          ...(input.modelId === undefined
            ? {}
            : { chatModelId: input.modelId }),
          ...(input.reasoningEffort === undefined
            ? {}
            : { chatReasoningEffort: input.reasoningEffort ?? null }),
          ...(input.mode === undefined ? {} : { mode: input.mode }),
        },
        threadId: input.threadId,
        utils,
        workspaceId: activeWorkspace?.id,
      });
    },
    onError: (_error, input) => {
      void utils.threads.get.invalidate({ threadId: input.threadId });
      void utils.threads.list.invalidate();
    },
    onSuccess: (data) => {
      applyThreadSettingsCacheUpdate({
        patch: {
          chatModelId: data.modelId,
          chatReasoningEffort: data.reasoningEffort ?? null,
          mode: data.mode,
        },
        threadId: data.threadId,
        utils,
        workspaceId: activeWorkspace?.id,
      });
    },
  });

  const availableModels = useMemo(
    () =>
      (modelsQuery.data ?? []).filter(
        (model) => model.isConnected && model.isEnabled,
      ),
    [modelsQuery.data],
  );

  const selectedModel =
    availableModels.find(
        (model) =>
          getCompositeModelId(model.provider, model.modelId) === selectedModelKey,
    ) ?? null;
  const canPersistThreadSelection = Boolean(
    threadId && threadSelection && (persistThreadSelection ?? true),
  );
  const selectionScopeKey = threadId ?? "__global__";
  const hasThreadSelection = Boolean(threadSelection?.modelId);
  const preferredModelId = hasThreadSelection
    ? (threadSelection?.modelId ?? null)
    : (globalSelectionQuery.data?.modelId ?? null);
  const preferredReasoningEffort = hasThreadSelection
    ? (threadSelection?.reasoningEffort ?? null)
    : ((globalSelectionQuery.data?.reasoningEffort as ReasoningEffort | null) ??
      null);
  const preferencesReady =
    hasThreadSelection || !globalSelectionQuery.isLoading;

  const hasWorkspace = Boolean(activeWorkspace);
  const hasModels = availableModels.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const isLocked = !hasWorkspace || !hasModels;
  const supportedReasoningEfforts = selectedModel
    ? getSupportedReasoningEfforts(
        selectedModel.provider,
        selectedModel.modelId,
      )
    : [];
  const supportsReasoning = supportedReasoningEfforts.length > 0;
  const reasoningLabel = selectedReasoningEffort
    ? getReasoningEffortLabel(selectedReasoningEffort)
    : null;
  const attachmentCapabilities = selectedModel
    ? getModelAttachmentCapabilities(
        selectedModel.provider,
        selectedModel.modelId,
      )
    : {
        supportsCodeTextFiles: false,
        supportsDocuments: false,
        supportsImages: false,
      };
  const unsupportedAttachmentKinds = useMemo(() => {
    return Array.from(
      new Set(
        attachments
          .map((attachment) => attachment.fileType.kind)
          .filter(
            (kind) => !supportsAttachmentKind(kind, attachmentCapabilities),
          ),
      ),
    );
  }, [attachmentCapabilities, attachments]);
  const attachmentWarning = useMemo(() => {
    if (!selectedModel || unsupportedAttachmentKinds.length === 0) {
      return "";
    }

    const labels = unsupportedAttachmentKinds.map(getAttachmentKindLabel);

    return `${selectedModel.displayName} may not support ${labels.join(", ")} as chat attachments.`;
  }, [selectedModel, unsupportedAttachmentKinds]);

  const persistSelection = useCallback(
    (
      modelId: string,
      reasoningEffort: ReasoningEffort | null,
      options?: {
        mode?: "chat" | "plan";
        skipGlobal?: boolean;
        skipThread?: boolean;
      },
    ) => {
      if (!options?.skipGlobal) {
        updateGlobalSelection.mutate({
          mode: options?.mode,
          modelId,
          reasoningEffort,
        });
      }

      if (!options?.skipThread && canPersistThreadSelection && threadId) {
        updateThreadSelection.mutate({
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          modelId,
          reasoningEffort,
          threadId,
        });
      }
    },
    [
      canPersistThreadSelection,
      threadId,
      updateGlobalSelection,
      updateThreadSelection,
    ],
  );

  const placeholderText = "Ask follow-up changes";

  const editor = useEditor({
    content: {
      content: [{ type: "paragraph" }],
      type: "doc",
    },
    editorProps: {
      attributes: {
        class:
          "sentinel-composer-editor outline-none text-[14px] text-foreground",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSendRef.current();
          return true;
        }
        return false;
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
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isLocked && !isBusy);
    const placeholderExt = editor.extensionManager.extensions.find(
      (ext) => ext.name === "placeholder",
    );
    if (placeholderExt) {
      placeholderExt.options.placeholder = isBusy
        ? "Generating..."
        : placeholderText;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, isLocked, isBusy, placeholderText]);

  useEffect(() => {
    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      initializedSelectionScopeRef.current = null;
      threadPersistenceReadyRef.current = false;
    }
  }, [selectionScopeKey]);

  useEffect(() => {
    if (availableModels.length === 0) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      initializedSelectionScopeRef.current = null;
      return;
    }

    if (!preferencesReady) {
      return;
    }

    if (initializedSelectionScopeRef.current === selectionScopeKey) {
      return;
    }

    const normalizedPreferredModelId = normalizeSelectedModelId(
      preferredModelId,
      availableModels,
    );

    const preferredModel = normalizedPreferredModelId
      ? (availableModels.find(
          (model) =>
            getCompositeModelId(model.provider, model.modelId) ===
            normalizedPreferredModelId,
        ) ?? null)
      : null;
    const nextModel = preferredModel ?? availableModels[0] ?? null;
    const nextModelKey = nextModel
      ? getCompositeModelId(nextModel.provider, nextModel.modelId)
      : null;

    setSelectedModelKey(nextModelKey);
    setSelectedReasoningEffort(
      nextModel
        ? resolveReasoningEffort(
            nextModel.provider,
            nextModel.modelId,
            preferredModel ? preferredReasoningEffort : null,
          )
        : null,
    );
    initializedSelectionScopeRef.current = selectionScopeKey;
  }, [
    availableModels,
    preferredModelId,
    preferredReasoningEffort,
    preferencesReady,
    selectionScopeKey,
  ]);

  useEffect(() => {
    if (!preferencesReady) return;

    const currentThreadMode = threadSelection?.mode ?? null;

    if (planModeInitScopeRef.current !== selectionScopeKey) {
      planModeInitScopeRef.current = selectionScopeKey;
      lastSyncedThreadModeRef.current = currentThreadMode;
      const preferredMode = currentThreadMode
        ? currentThreadMode
        : draftMode
          ? draftMode
          : (globalSelectionQuery.data?.mode ?? "chat");
      setPlanMode(preferredMode === "plan");
      return;
    }

    if (
      currentThreadMode &&
      currentThreadMode !== lastSyncedThreadModeRef.current
    ) {
      lastSyncedThreadModeRef.current = currentThreadMode;
      setPlanMode(currentThreadMode === "plan");
    }
  }, [
    draftMode,
    globalSelectionQuery.data?.mode,
    preferencesReady,
    selectionScopeKey,
    threadSelection?.mode,
  ]);

  useEffect(() => {
    if (!selectedModelKey || availableModels.length === 0) {
      return;
    }

    const stillAvailable = availableModels.some(
      (model) =>
        getCompositeModelId(model.provider, model.modelId) === selectedModelKey,
    );
    if (stillAvailable) {
      return;
    }

    const fallbackModel = availableModels[0];
    if (!fallbackModel) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      return;
    }

    const fallbackModelKey = getCompositeModelId(
      fallbackModel.provider,
      fallbackModel.modelId,
    );
    const fallbackReasoningEffort = resolveReasoningEffort(
      fallbackModel.provider,
      fallbackModel.modelId,
      null,
    );

    setSelectedModelKey(fallbackModelKey);
    setSelectedReasoningEffort(fallbackReasoningEffort);
    persistSelection(fallbackModelKey, fallbackReasoningEffort);
  }, [availableModels, persistSelection, selectedModelKey]);

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
    if (promptSeedKey === undefined) {
      return;
    }

    setAttachments(attachmentSeed.map(createComposerAttachmentFromFilePart));
  }, [attachmentSeed, promptSeedKey]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        modelMenuRef.current &&
        event.target instanceof Node &&
        !modelMenuRef.current.contains(event.target)
      )
        setModelMenuOpen(false);
      if (
        reasoningMenuRef.current &&
        event.target instanceof Node &&
        !reasoningMenuRef.current.contains(event.target)
      )
        setReasoningMenuOpen(false);
      if (
        composerMenuRef.current &&
        event.target instanceof Node &&
        !composerMenuRef.current.contains(event.target)
      )
        setComposerMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!selectedModel) {
      if (selectedReasoningEffort !== null) {
        setSelectedReasoningEffort(null);
      }
      return;
    }

    const nextReasoningEffort = resolveReasoningEffort(
      selectedModel.provider,
      selectedModel.modelId,
      selectedReasoningEffort,
    );

    if (nextReasoningEffort !== selectedReasoningEffort) {
      setSelectedReasoningEffort(nextReasoningEffort);
    }
  }, [selectedModel, selectedReasoningEffort]);

  useEffect(() => {
    if (!canPersistThreadSelection || !threadSelection) {
      threadPersistenceReadyRef.current = false;
      return;
    }

    if (!selectedModelKey || threadPersistenceReadyRef.current) {
      return;
    }

    threadPersistenceReadyRef.current = true;

    const persistedReasoningEffort = threadSelection.reasoningEffort ?? null;
    const selectedMode = planMode ? "plan" : "chat";
    if (
      threadSelection.modelId === selectedModelKey &&
      persistedReasoningEffort === selectedReasoningEffort &&
      threadSelection.mode === selectedMode
    ) {
      return;
    }

    persistSelection(selectedModelKey, selectedReasoningEffort, {
      mode: selectedMode,
      skipGlobal: true,
    });
  }, [
    canPersistThreadSelection,
    planMode,
    persistSelection,
    selectedModelKey,
    selectedReasoningEffort,
    threadSelection,
  ]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.previewUrl?.startsWith("blob:"))
          URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addBrowserFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = createBrowserAttachments(files);

    if (rejected.length > 0) {
      setAttachmentError(
        "Some files are not supported yet. Use images, text/code files, PDF, office documents, spreadsheets, or presentations.",
      );
    } else {
      setAttachmentError("");
    }

    if (accepted.length === 0) {
      return;
    }

    setAttachments((current) => [...current, ...accepted]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const removed = current.find((a) => a.id === id);
      if (removed?.previewUrl?.startsWith("blob:"))
        URL.revokeObjectURL(removed.previewUrl);
      return current.filter((a) => a.id !== id);
    });
  }, []);

  const handlePickFiles = async () => {
    setAttachmentError("");
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    addBrowserFiles(Array.from(fileList));
    e.target.value = "";
  };

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const handleSelectModel = useCallback(
    (modelKey: string) => {
    const nextModel = availableModels.find(
        (model) =>
          getCompositeModelId(model.provider, model.modelId) === modelKey,
      );
      if (!nextModel) {
        return;
      }

      const nextReasoningEffort = resolveReasoningEffort(
        nextModel.provider,
        nextModel.modelId,
        selectedReasoningEffort,
      );

      setSelectedModelKey(modelKey);
      setSelectedReasoningEffort(nextReasoningEffort);
      setModelMenuOpen(false);
      persistSelection(modelKey, nextReasoningEffort);
    },
    [availableModels, persistSelection, selectedReasoningEffort],
  );

  const handleSelectReasoningEffort = useCallback(
    (effort: ReasoningEffort) => {
      if (!selectedModelKey) {
        return;
      }

      setSelectedReasoningEffort(effort);
      setReasoningMenuOpen(false);
      persistSelection(selectedModelKey, effort);
    },
    [persistSelection, selectedModelKey],
  );

  const handleTogglePlanMode = useCallback(() => {
    setPlanMode((prev) => {
      const next = !prev;
      if (selectedModelKey) {
        persistSelection(selectedModelKey, selectedReasoningEffort, {
          mode: next ? "plan" : "chat",
        });
      } else {
        updateGlobalSelection.mutate({
          mode: next ? "plan" : "chat",
        });
        if (canPersistThreadSelection && threadId) {
          updateThreadSelection.mutate({
            mode: next ? "plan" : "chat",
            threadId,
          });
        }
      }
      return next;
    });
  }, [
    canPersistThreadSelection,
    persistSelection,
    selectedModelKey,
    selectedReasoningEffort,
    threadId,
    updateGlobalSelection,
    updateThreadSelection,
  ]);

  const handleSend = useCallback(async () => {
    if (!editor || !selectedModelKey || !onSend || isBusy) return;
    const text = editor.getText().trim();
    if (!text && attachments.length === 0) return;

    try {
      setAttachmentError("");
      const files = await convertComposerAttachmentsToFileParts(attachments);
      if (!text && files.length === 0) {
        setAttachmentError("Unable to attach one or more selected files.");
        return;
      }

      onSend({
        ...(files.length > 0 ? { files } : {}),
        modelId: selectedModelKey,
        reasoningEffort: selectedReasoningEffort,
        text,
        threadMode: planMode ? "plan" : "chat",
      });
    } catch {
      setAttachmentError("Unable to attach one or more selected files.");
      return;
    }
    editor.commands.clearContent();
    setPreviewAttachment(null);
    clearAttachments();
  }, [
    attachments,
    clearAttachments,
    editor,
    isBusy,
    onSend,
    planMode,
    selectedModelKey,
    selectedReasoningEffort,
  ]);

  handleSendRef.current = () => {
    void handleSend();
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
      <input
        accept={CHAT_ATTACHMENT_ACCEPT}
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileInputChange}
        type="file"
      />

      <div className="pointer-events-auto w-full rounded-[20px] border border-border/50 dark:border-border/80 bg-background  dark:bg-surface p-2.5 shadow-[0_0_10px_rgba(0,0,0,0.05)]">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
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

        {isEditing ? (
          <button
            className="text-muted hover:text-foreground px-2 text-xs"
            onClick={onCancelEdit}
            type="button"
          >
            Cancel edit
          </button>
        ) : null}

        <div className="px-2">
          <div className="min-h-[28px]">
            {!editor ? (
              <div className="pointer-events-none py-1 text-[14px] text-muted/50">
                {placeholderText}
              </div>
            ) : null}
            <EditorContent editor={editor} />
          </div>
        </div>

        {disabledMessage && (
          <div className="px-3 pb-1">
            <p className="text-xs text-muted">{disabledMessage}</p>
          </div>
        )}

        {attachmentError && (
          <div className="px-3 pb-1">
            <p className="text-danger-soft-foreground text-xs">
              {attachmentError}
            </p>
          </div>
        )}

        {attachmentWarning && !attachmentError && (
          <div className="px-3 pb-1">
            <p className="text-[11px] text-amber-200/75">{attachmentWarning}</p>
          </div>
        )}

        <div className="flex h-10 items-center justify-between px-1.5">
          <div className="flex items-center gap-2">
            <div className="relative" ref={composerMenuRef}>
              <button
                className="flex border cursor-pointer border-border/50 dark:bg-background/50 bg-surface h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:text-foreground disabled:opacity-30"
                disabled={!hasWorkspace}
                onClick={() => setComposerMenuOpen((o) => !o)}
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Add01Icon}
                  size={18}
                  strokeWidth={1.5}
                />
              </button>

              <AnimatePresence>
                {composerMenuOpen && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute bottom-10 left-0 z-30 w-48 rounded-xl border border-border bg-overlay p-1 shadow-overlay"
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    initial={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{
                      duration: 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <button
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1 text-left text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground"
                      onClick={() => {
                        setComposerMenuOpen(false);
                        void handlePickFiles();
                      }}
                      type="button"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Attachment01Icon}
                        size={15}
                        strokeWidth={1.5}
                      />
                      <span>Add photos & files</span>
                    </button>

                    <div className="mx-2 my-0.5 h-px bg-separator" />

                    <button
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground"
                      onClick={handleTogglePlanMode}
                      type="button"
                    >
                      <span className="flex items-center gap-2.5">
                        <HugeiconsIcon
                          color="currentColor"
                          icon={AiIdeaIcon}
                          size={15}
                          strokeWidth={1.5}
                        />
                        <span>Plan mode</span>
                      </span>

                      <Switch
                        size="sm"
                        isSelected={planMode}
                        // @ts-expect-error - onValueChange is not a valid prop for SwitchRootProps
                        onValueChange={handleTogglePlanMode as any}
                      >
                        <Switch.Control>
                          <Switch.Thumb>
                            <Switch.Icon />
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative ml-1" ref={modelMenuRef}>
              <button
                className="flex h-8 cursor-pointer border border-border/50 dark:border-border/80 items-center gap-1 rounded-xl px-2 text-[13px] text-muted transition-colors bg-background hover:bg-default hover:text-foreground disabled:opacity-30"
                disabled={!hasModels || modelsQuery.isLoading}
                onClick={() => setModelMenuOpen((o) => !o)}
                type="button"
              >
                {modelsQuery.isLoading ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedModel ? (
                      <ProviderIcon
                        className="h-3 w-3"
                        provider={selectedModel.provider}
                      />
                    ) : null}
                    <span className="max-w-[160px] truncate">
                      {selectedModel?.displayName ?? "No model"}
                    </span>
                  </span>
                )}
                <HugeiconsIcon
                  className={`transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
                  color="currentColor"
                  icon={ArrowDown01Icon}
                  size={11}
                  strokeWidth={1.5}
                />
              </button>

              <AnimatePresence>
                {modelMenuOpen && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute bottom-10 left-0 z-30 max-h-[280px] w-48 overflow-y-auto rounded-2xl border border-border bg-overlay p-1 shadow-overlay"
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    initial={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{
                      duration: 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {availableModels.map((model) => {
        const modelKey = getCompositeModelId(
          model.provider,
          model.modelId,
                      );
                      const isSelected = selectedModelKey === modelKey;
                      return (
                        <button
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-default text-foreground"
                              : "text-muted hover:bg-default hover:text-foreground"
                          }`}
                          key={modelKey}
                          onClick={() => handleSelectModel(modelKey)}
                          type="button"
                        >
                          <ProviderIcon
                            className="h-4 w-4"
                            provider={model.provider}
                          />
                          <span className="truncate text-[13px]">
                            {model.displayName}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {supportsReasoning && (
              <div className="relative" ref={reasoningMenuRef}>
                <button
                  className="flex h-8 cursor-pointer border border-border/50 dark:border-border/80 items-center gap-1 rounded-xl px-2 text-[13px] text-muted transition-colors bg-background hover:bg-default hover:text-foreground"
                  onClick={() => setReasoningMenuOpen((open) => !open)}
                  type="button"
                >
                  <span>{reasoningLabel ?? "Medium"}</span>
                  <HugeiconsIcon
                    className={`transition-transform ${reasoningMenuOpen ? "rotate-180" : ""}`}
                    color="currentColor"
                    icon={ArrowDown01Icon}
                    size={11}
                    strokeWidth={1.5}
                  />
                </button>

                <AnimatePresence>
                  {reasoningMenuOpen && (
                    <motion.div
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="absolute bottom-10 -left-5 z-30 w-24 overflow-hidden rounded-2xl border border-border bg-overlay p-1 shadow-overlay"
                      exit={{ opacity: 0, scale: 0.97, y: 6 }}
                      initial={{ opacity: 0, scale: 0.97, y: 6 }}
                      transition={{
                        duration: 0.15,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {supportedReasoningEfforts.map((effort) => {
                        const isSelected = selectedReasoningEffort === effort;
                        return (
                          <button
                            className={`flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                              isSelected
                                ? "bg-default text-foreground"
                                : "text-muted hover:bg-default hover:text-foreground"
                            }`}
                            key={effort}
                            onClick={() => handleSelectReasoningEffort(effort)}
                            type="button"
                          >
                            {getReasoningEffortLabel(effort)}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {planMode && (
              <div className="ml-1 flex items-center gap-1 border-l border-border/50 pl-2">
                <HugeiconsIcon
                  className="text-foreground"
                  color="currentColor"
                  icon={AiIdeaIcon}
                  size={13}
                  strokeWidth={1.5}
                />
                <span className="text-[13px] text-foreground">Plan</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isBusy ? (
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full bg-default text-muted transition-colors hover:text-foreground"
                onClick={onStop}
                type="button"
              >
                <svg
                  fill="currentColor"
                  height={12}
                  viewBox="0 0 16 16"
                  width={12}
                >
                  <rect height={10} rx={2} width={10} x={3} y={3} />
                </svg>
              </button>
            ) : (
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-80 disabled:opacity-25 disabled:cursor-not-allowed"
                disabled={isLocked || !selectedModelKey}
                onClick={handleSend}
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={ArrowUp02Icon}
                  size={16}
                  strokeWidth={1.5}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {previewAttachment?.previewUrl && (
        <ImagePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </>
  );
}

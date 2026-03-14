"use client";

import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileUIPart } from "ai";

import {
  getModelAttachmentCapabilities,
  type ReasoningEffort,
  getSupportedReasoningEfforts,
} from "@/lib/ai/providers/models";
import {
  getCompositeModelId,
  normalizeSelectedModelId,
} from "@/lib/ai/providers/model-selection";
import { applyThreadSettingsCacheUpdate } from "@/lib/threads/cache";
import { api } from "@/trpc/react";
import { useOutsideClick } from "@/hooks/use-outside-click";

import { AttachmentManager } from "./attachment-manager";
import {
  convertComposerAttachmentsToFileParts,
  createComposerAttachmentFromFilePart,
  createBrowserAttachments,
  type ComposerAttachment,
} from "./chat-attachments";
import { ComposerToolbar } from "./composer-toolbar";
import {
  getAttachmentKindLabel,
  getReasoningEffortLabel,
  resolveReasoningEffort,
  supportsAttachmentKind,
} from "./chat-composer-helpers";
import { ModelSelector } from "./model-selector";

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

  useOutsideClick([
    {
      onOutsideClick: () => setModelMenuOpen(false),
      ref: modelMenuRef,
    },
    {
      onOutsideClick: () => setReasoningMenuOpen(false),
      ref: reasoningMenuRef,
    },
    {
      onOutsideClick: () => setComposerMenuOpen(false),
      ref: composerMenuRef,
    },
  ]);

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
      <div className="pointer-events-auto w-full rounded-[20px] border border-border/50 dark:border-border/80 bg-background  dark:bg-surface p-2.5 shadow-[0_0_10px_rgba(0,0,0,0.05)]">
        <AttachmentManager
          attachmentError={attachmentError}
          attachmentWarning={attachmentWarning}
          attachments={attachments}
          fileInputRef={fileInputRef}
          onFileInputChange={handleFileInputChange}
          onPreviewClose={() => setPreviewAttachment(null)}
          onPreviewOpen={setPreviewAttachment}
          onRemoveAttachment={removeAttachment}
          previewAttachment={previewAttachment}
        />

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

        <ComposerToolbar
          composerMenuOpen={composerMenuOpen}
          composerMenuRef={composerMenuRef}
          hasWorkspace={hasWorkspace}
          isBusy={isBusy}
          isLocked={isLocked}
          modelSelector={
            <ModelSelector
              availableModels={availableModels}
              isLoading={modelsQuery.isLoading}
              modelMenuOpen={modelMenuOpen}
              modelMenuRef={modelMenuRef}
              onModelMenuOpenChange={setModelMenuOpen}
              onReasoningMenuOpenChange={setReasoningMenuOpen}
              onSelectModel={handleSelectModel}
              onSelectReasoningEffort={handleSelectReasoningEffort}
              reasoningLabel={reasoningLabel}
              reasoningMenuOpen={reasoningMenuOpen}
              reasoningMenuRef={reasoningMenuRef}
              selectedModel={selectedModel}
              selectedModelKey={selectedModelKey}
              selectedReasoningEffort={selectedReasoningEffort}
              supportedReasoningEfforts={supportedReasoningEfforts}
            />
          }
          onComposerMenuOpenChange={setComposerMenuOpen}
          onPickFiles={() => {
            void handlePickFiles();
          }}
          onSend={() => {
            void handleSend();
          }}
          onStop={onStop}
          onTogglePlanMode={handleTogglePlanMode}
          planMode={planMode}
          selectedModelKey={selectedModelKey}
        />
      </div>
    </>
  );
}

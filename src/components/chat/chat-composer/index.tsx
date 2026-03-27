"use client";

import { EditorContent } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FOLLOW_UP_BEHAVIOR } from "@/schemas/general-settings.schema";
import { getExactContextWindowUsage } from "@/lib/ai/chat/context-window";
import { api } from "@/trpc/react";

import { AttachmentManager } from "../attachment-manager";
import { ComposerToolbar } from "../composer-toolbar";
import { ComposerWorkspaceBar } from "../composer-workspace-bar";
import { ModelSelector } from "../model-selector";
import { QueuedMessages } from "../queued-messages";
import { Button } from "@heroui/react";

import type { ChatComposerProps } from "./types";
import { useAttachments } from "./use-attachments";
import { useComposerEditor } from "./use-composer-editor";
import { useModelSelection } from "./use-model-selection";
import { usePersistSelection } from "./use-persist-selection";
import { usePlanMode } from "./use-plan-mode";

export type { ChatComposerProps } from "./types";

export function ChatComposer({
  activeWorkspace,
  attachmentSeed = [],
  draftMode = null,
  isEditing = false,
  onCancelEdit,
  onQueueFollowUp,
  onRemoveQueuedFollowUp,
  onSelectionChange,
  onSend,
  onStop,
  onSteerFollowUp,
  onSteerQueuedFollowUp,
  persistThreadSelection,
  promptSeed,
  promptSeedKey,
  queuedFollowUps = [],
  showBranchSwitcher = false,
  status = "ready",
  threadId,
  threadSelection = null,
}: ChatComposerProps) {
  const handleSendRef = useRef<() => void>(() => {});
  const utils = api.useUtils();

  const hasWorkspace = Boolean(activeWorkspace);
  const isBusy = status === "submitted" || status === "streaming";
  const canPersistThreadSelection = Boolean(
    threadId && threadSelection && (persistThreadSelection ?? true),
  );
  const selectionScopeKey = threadId ?? "__global__";

  const generalSettingsQuery = api.generalSettings.get.useQuery();
  const followUpBehavior =
    generalSettingsQuery.data?.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR;

  const {
    globalSelectionQuery,
    persistEngineSelection,
    persistSelection,
    updateGlobalSelection,
    updateThreadSelection,
  } = usePersistSelection({
    activeWorkspaceId: activeWorkspace?.id,
    canPersistThreadSelection,
    threadId,
  });

  const {
    addBrowserFiles,
    attachmentError,
    attachments,
    clearAttachments,
    convertToFileParts,
    fileInputRef,
    handleFileInputChange,
    handlePickFiles,
    previewAttachment,
    removeAttachment,
    setAttachmentError,
    setPreviewAttachment,
  } = useAttachments({ attachmentSeed, promptSeedKey });

  const {
    availableModels,
    enginesQuery,
    handleSelectEngine,
    handleSelectModel,
    handleSelectReasoningEffort,
    modelsQuery,
    selectedEngine,
    selectedEngineStatus,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  } = useModelSelection({
    globalSelectionQuery,
    onSelectionChange,
    persistEngineSelection,
    persistSelection,
    selectionScopeKey,
    threadSelection,
  });

  const planModeAvailable = true;
  const { handleTogglePlanMode, planMode } = usePlanMode({
    canPersistThreadSelection,
    draftMode,
    globalSelectionQuery,
    onSelectionChange,
    planModeAvailable,
    persistSelection,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    selectionScopeKey,
    threadId,
    threadSelection,
    updateGlobalSelection,
    updateThreadSelection,
  });

  const hasModels = availableModels.length > 0;
  const isLocked = !hasWorkspace || !hasModels;

  const { editor, placeholderText } = useComposerEditor({
    isBusy,
    isLocked,
    isThread: threadId != null,
    onAddBrowserFiles: addBrowserFiles,
    onSendRef: handleSendRef,
    promptSeed,
    promptSeedKey,
  });

  const threadMessages =
    threadId != null
      ? (utils.threads.get.getData({ threadId })?.messages ?? [])
      : [];

  const contextWindowIndicator =
    selectedEngine === "sentinel" && selectedModelKey && selectedModel
      ? getExactContextWindowUsage({
          contextWindow: selectedModel.contextWindow,
          fixedWindowSize:
            generalSettingsQuery.data?.contextCompactionFixedWindowSize,
          messages: threadMessages,
          useFixedWindow:
            generalSettingsQuery.data?.contextCompactionUseFixedWindow,
        })
      : null;

  useEffect(() => {
    if (!canPersistThreadSelection || !threadSelection) {
      threadPersistenceReadyRef.current = false;
      return;
    }
    if (!selectedModelKey || threadPersistenceReadyRef.current) return;

    threadPersistenceReadyRef.current = true;

    const persistedReasoningEffort = threadSelection.reasoningEffort ?? null;
    const selectedMode = planMode ? "plan" : "chat";
    if (
      (threadSelection.engine ?? "sentinel") === selectedEngine &&
      threadSelection.modelId === selectedModelKey &&
      persistedReasoningEffort === selectedReasoningEffort &&
      threadSelection.mode === selectedMode
    ) {
      return;
    }

    persistSelection(selectedModelKey, selectedReasoningEffort, {
      engine: selectedEngine,
      mode: selectedMode,
      skipGlobal: true,
    });
  }, [
    canPersistThreadSelection,
    planMode,
    planModeAvailable,
    persistSelection,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    threadPersistenceReadyRef,
    threadSelection,
  ]);

  const handleSend = useCallback(async () => {
    if (!editor || !selectedModelKey || !onSend) return;
    const text = editor.getText().trim();
    if (!text && attachments.length === 0) return;

    try {
      setAttachmentError("");
      const files = await convertToFileParts();
      if (!text && files.length === 0) {
        setAttachmentError("Unable to attach one or more selected files.");
        return;
      }

      const messagePayload = {
        engine: selectedEngine,
        ...(files.length > 0 ? { files } : {}),
        modelId: selectedModelKey,
        reasoningEffort: selectedReasoningEffort,
        text,
        threadMode: (planMode ? "plan" : "chat") as "chat" | "plan",
      };

      if (isBusy) {
        if (followUpBehavior === "queue") {
          await onQueueFollowUp?.(messagePayload);
        } else {
          await onSteerFollowUp?.(messagePayload);
        }
      } else {
        onSend(messagePayload);
      }
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
    convertToFileParts,
    editor,
    followUpBehavior,
    isBusy,
    onQueueFollowUp,
    onSend,
    onSteerFollowUp,
    planMode,
    planModeAvailable,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    setAttachmentError,
    setPreviewAttachment,
  ]);

  handleSendRef.current = () => {
    void handleSend();
  };

  const disabledMessage =
    !modelsQuery.isLoading && !hasModels ? (
      <>
        {selectedEngine !== "sentinel" ? (
          (selectedEngineStatus?.error ??
          `${selectedEngineStatus?.label ?? "This engine"} is unavailable in this Sentinel runtime.`)
        ) : (
          <>
            Connect a provider in{" "}
            <Link
              className="text-foreground underline"
              href="/settings/providers"
            >
              Settings
            </Link>
            .
          </>
        )}
      </>
    ) : null;

  const engineOptions =
    enginesQuery.data?.map((engine) => ({
      engine: engine.engine,
      error: engine.error,
      isAvailable: engine.isAvailable,
      label: engine.label,
    })) ?? [];
  const showEngineSelector = !canPersistThreadSelection;

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (isLocked) return;

    const handleDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        addBrowserFiles(Array.from(files));
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [addBrowserFiles, isLocked]);

  return (
    <>
      {isDraggingOver ? (
        <div className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent/50 bg-surface/80 px-12 py-10">
            <svg
              className="size-10 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                d="M12 16V4m0 0-4 4m4-4 4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm font-medium text-foreground">
              Drop files to attach
            </p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-auto w-full rounded-[24px] border border-border/50 bg-background shadow-[0_0_10px_rgba(0,0,0,0.05)] dark:border-border/20 dark:bg-surface">
        <div className="px-2.5 py-2">
          <AttachmentManager
            attachmentError={attachmentError}
            attachments={attachments}
            fileInputRef={fileInputRef}
            onFileInputChange={handleFileInputChange}
            onPreviewClose={() => setPreviewAttachment(null)}
            onPreviewOpen={setPreviewAttachment}
            onRemoveAttachment={removeAttachment}
            previewAttachment={previewAttachment}
          />

          {isEditing ? (
            <Button
              className="mb-1 h-7"
              onClick={onCancelEdit}
              size="sm"
              variant="tertiary"
            >
              Cancel edit
            </Button>
          ) : null}

          <QueuedMessages
            messages={queuedFollowUps}
            onRemove={(id) => {
              void onRemoveQueuedFollowUp?.(id);
            }}
            onSteer={(id) => {
              void onSteerQueuedFollowUp?.(id);
            }}
          />

          <div className="px-2">
            <div className="min-h-[20px]">
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
            engineOptions={engineOptions}
            hasWorkspace={hasWorkspace}
            isBusy={isBusy}
            isLocked={isLocked}
            onSelectEngine={handleSelectEngine}
            selectedEngine={selectedEngine}
            showEngineSelector={showEngineSelector}
            contextWindowIndicator={
              contextWindowIndicator
                ? {
                    compactionEnabled:
                      generalSettingsQuery.data?.contextCompactionEnabled ??
                      false,
                    contextWindowMode: contextWindowIndicator.source,
                    compactionWindowPercent:
                      generalSettingsQuery.data
                        ?.contextCompactionWindowPercent ?? 70,
                    contextWindow: contextWindowIndicator.contextWindow,
                    inputTokens: contextWindowIndicator.inputTokens,
                    modelContextWindow: selectedModel.contextWindow,
                    usedPercent: contextWindowIndicator.usedPercent,
                  }
                : null
            }
            modelSelector={
              <ModelSelector
                availableModels={availableModels}
                isLoading={modelsQuery.isLoading}
                onSelectModel={handleSelectModel}
                onSelectReasoningEffort={handleSelectReasoningEffort}
                selectedModel={selectedModel}
                selectedModelKey={selectedModelKey}
                selectedReasoningEffort={selectedReasoningEffort}
                supportedReasoningEfforts={supportedReasoningEfforts}
              />
            }
            onPickFiles={() => {
              void handlePickFiles();
            }}
            onSend={() => {
              void handleSend();
            }}
            onStop={onStop}
            onTogglePlanMode={handleTogglePlanMode}
            planModeAvailable={planModeAvailable}
            planMode={planMode}
            selectedModelKey={selectedModelKey}
          />
        </div>

        {activeWorkspace ? (
          <div className="overflow-hidden rounded-b-[24px] border-t border-border/25">
            <ComposerWorkspaceBar
              activeWorkspace={activeWorkspace}
              showBranchSwitcher={showBranchSwitcher}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

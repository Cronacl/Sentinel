"use client";

import { EditorContent } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOutsideClick } from "@/hooks/use-outside-click";
import { DEFAULT_FOLLOW_UP_BEHAVIOR } from "@/schemas/general-settings.schema";
import { api } from "@/trpc/react";

import { AttachmentManager } from "../attachment-manager";
import { ComposerToolbar } from "../composer-toolbar";
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
  onSend,
  onStop,
  onSteerFollowUp,
  onSteerQueuedFollowUp,
  persistThreadSelection,
  promptSeed,
  promptSeedKey,
  queuedFollowUps = [],
  status = "ready",
  threadId,
  threadSelection = null,
}: ChatComposerProps) {
  const handleSendRef = useRef<() => void>(() => {});
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);

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
    attachmentWarning,
    availableModels,
    handleSelectModel,
    handleSelectReasoningEffort,
    modelMenuOpen,
    modelMenuRef,
    modelsQuery,
    reasoningLabel,
    reasoningMenuOpen,
    reasoningMenuRef,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    setModelMenuOpen,
    setReasoningMenuOpen,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  } = useModelSelection({
    attachments,
    globalSelectionQuery,
    persistSelection,
    selectionScopeKey,
    threadSelection,
  });

  const { handleTogglePlanMode, planMode } = usePlanMode({
    canPersistThreadSelection,
    draftMode,
    globalSelectionQuery,
    persistSelection,
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
    onAddBrowserFiles: addBrowserFiles,
    onSendRef: handleSendRef,
    promptSeed,
    promptSeedKey,
  });

  useOutsideClick([
    { onOutsideClick: () => setModelMenuOpen(false), ref: modelMenuRef },
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
    if (!canPersistThreadSelection || !threadSelection) {
      threadPersistenceReadyRef.current = false;
      return;
    }
    if (!selectedModelKey || threadPersistenceReadyRef.current) return;

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
          <Button
            className="mb-1"
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

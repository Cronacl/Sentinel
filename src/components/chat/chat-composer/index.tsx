"use client";

import { EditorContent } from "@tiptap/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { Button } from "@heroui/react";
import { DEFAULT_FOLLOW_UP_BEHAVIOR } from "@/schemas/general-settings.schema";
import { getExactContextWindowUsage } from "@/lib/ai/chat/context-window";
import {
  extractComposerContext,
  hasComposerContext,
} from "@/lib/composer-context/extract";
import { api } from "@/trpc/react";

import { AttachmentManager } from "../attachment-manager";
import { ComposerToolbar } from "../composer-toolbar";
import { ComposerWorkspaceBar } from "../composer-workspace-bar";
import { ModelSelector } from "../model-selector";
import { QueuedMessages } from "../queued-messages";
import { shouldClearComposerAfterSendError } from "../chat-composer-helpers";
import { VoiceRecorderPanel } from "./voice-recorder-panel";

import type { ChatComposerProps, ComposerSendInput } from "./types";
import { useAttachments } from "./use-attachments";
import { useComposerEditor } from "./use-composer-editor";
import { useModelSelection } from "./use-model-selection";
import { usePersistSelection } from "./use-persist-selection";
import { usePlanMode } from "./use-plan-mode";
import { useVoiceInput } from "./use-voice-input";
import { shouldShowVoiceInputControl } from "./voice-input.helpers";
import { resolveThreadSelectionSyncInput } from "./thread-selection-sync";

export type {
  ChatComposerProps,
  ChatComposerStartPlanImplementationHandler,
} from "./types";

let hasComposerBootstrappedThisSession = false;
const IMPLEMENT_PLAN_PROMPT =
  "Implement the latest approved plan from this thread. Use the most recent plan response as the source of truth, begin executing it now, and reference that plan directly instead of treating 'Implement Plan' as a literal feature name.";

export function ChatComposer({
  activeWorkspace,
  attachmentSeed = [],
  draftPreparedWorktree = null,
  draftProjectMode = "local",
  draftThreadId,
  draftMode = null,
  isEditing = false,
  onCancelEdit,
  onDraftPreparedWorktreeChange,
  onDraftProjectModeChange,
  onQueueFollowUp,
  onRegisterStartPlanImplementation,
  onRemoveQueuedFollowUp,
  onSelectionChange,
  onSend,
  onStartPlanImplementationSend,
  onStop,
  onSteerFollowUp,
  onSteerQueuedFollowUp,
  persistThreadSelection,
  repoThreadId,
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
  const [isRepoSetupPending, setIsRepoSetupPending] = useState(false);
  const canPersistThreadSelection = Boolean(
    threadId && threadSelection && (persistThreadSelection ?? true),
  );
  const selectionScopeKey = threadId ?? "__global__";

  const generalSettingsQuery = api.generalSettings.get.useQuery();
  const voiceSettingsQuery = api.voiceSettings.get.useQuery();
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
    engineOptions,
    handleSelectEngine,
    handleSelectModel,
    handleSelectReasoningEffort,
    modelsQuery,
    selectedEngine,
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
  const { handleTogglePlanMode, planMode, planModeReady, setPlanMode } =
    usePlanMode({
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
  const isLocked = !hasWorkspace;
  const canSend =
    hasWorkspace &&
    hasModels &&
    Boolean(selectedModelKey) &&
    !isRepoSetupPending;
  const draftRepoState =
    !repoThreadId && draftProjectMode === "worktree" && draftPreparedWorktree
      ? {
          activeBranch: draftPreparedWorktree.branch,
          projectMode: "worktree" as const,
          worktreePath: draftPreparedWorktree.path,
        }
      : undefined;

  const skillsQuery = api.skills.list.useQuery(
    activeWorkspace?.id ? { workspaceId: activeWorkspace.id } : undefined,
    {
      staleTime: 30_000,
    },
  );

  const fetchPathSuggestions = useCallback(
    async (query: string) => {
      if (!activeWorkspace?.id) return [];
      const result = await utils.workspaceFiles.search.fetch({
        limit: 15,
        query,
        workspaceId: activeWorkspace.id,
      });
      return result.items;
    },
    [activeWorkspace?.id, utils.workspaceFiles.search],
  );

  const fetchSkillSuggestions = useCallback(() => {
    const data = skillsQuery.data;
    if (!data) return [];
    return data.skills.map((skill) => ({
      description: skill.description,
      directory: skill.directory,
      installOrigin: skill.installOrigin,
      isExternal: skill.isExternal,
      name: skill.name,
      scope: skill.scope,
      sourceKind: skill.sourceKind,
      target: skill.target,
    }));
  }, [skillsQuery.data]);

  const { editor, placeholderText } = useComposerEditor({
    activeWorkspaceId: activeWorkspace?.id ?? null,
    isBusy,
    isLocked,
    isThread: threadId != null,
    onAddBrowserFiles: addBrowserFiles,
    onFetchPathSuggestions: fetchPathSuggestions,
    onFetchSkillSuggestions: fetchSkillSuggestions,
    onSendRef: handleSendRef,
    promptSeed,
    promptSeedKey,
    selectedEngine,
  });
  const voiceInput = useVoiceInput({ editor });

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
    const syncInput = resolveThreadSelectionSyncInput({
      canPersistThreadSelection,
      planMode,
      planModeReady,
      selectedEngine,
      selectedModelKey,
      selectedReasoningEffort,
      threadPersistenceReady: threadPersistenceReadyRef.current,
      threadSelection,
    });

    if (!syncInput) {
      return;
    }

    threadPersistenceReadyRef.current = true;

    persistSelection(syncInput.modelId, syncInput.reasoningEffort, {
      engine: syncInput.engine,
      mode: syncInput.mode,
      skipGlobal: true,
    });
  }, [
    canPersistThreadSelection,
    planMode,
    planModeReady,
    persistSelection,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    threadPersistenceReadyRef,
    threadSelection,
  ]);

  const dispatchMessagePayload = useCallback(
    async (messagePayload: ComposerSendInput) => {
      if (isBusy) {
        if (followUpBehavior === "queue") {
          await onQueueFollowUp?.(messagePayload);
        } else {
          await onSteerFollowUp?.(messagePayload);
        }
      } else {
        await onSend?.(messagePayload);
      }
    },
    [followUpBehavior, isBusy, onQueueFollowUp, onSend, onSteerFollowUp],
  );

  const handleSend = useCallback(async () => {
    if (!editor || !selectedModelKey || !onSend || !canSend) return;
    const text = editor.getText().trim();
    if (!text && attachments.length === 0) return;

    let messagePayload: ComposerSendInput | null = null;

    try {
      setAttachmentError("");
      const files = await convertToFileParts();
      if (!text && files.length === 0) {
        setAttachmentError("Unable to attach one or more selected files.");
        return;
      }

      const composerContext = extractComposerContext(editor);

      messagePayload = {
        ...(hasComposerContext(composerContext) ? { composerContext } : {}),
        ...(draftRepoState ? { draftRepoState } : {}),
        engine: selectedEngine,
        ...(files.length > 0 ? { files } : {}),
        modelId: selectedModelKey,
        reasoningEffort: selectedReasoningEffort,
        text,
        threadMode: (planMode ? "plan" : "chat") as "chat" | "plan",
      };
    } catch {
      setAttachmentError("Unable to attach one or more selected files.");
      return;
    }

    if (!messagePayload) {
      return;
    }

    const draftDocument = editor.getJSON();
    editor.commands.clearContent();
    setPreviewAttachment(null);

    let shouldClearComposer = true;

    try {
      await dispatchMessagePayload(messagePayload);
    } catch (error) {
      shouldClearComposer = shouldClearComposerAfterSendError(error);
      if (!shouldClearComposer) {
        editor.commands.setContent(draftDocument);
        editor.commands.focus("end");
        return;
      }
    }

    if (shouldClearComposer) {
      clearAttachments();
    }
  }, [
    attachments,
    clearAttachments,
    convertToFileParts,
    dispatchMessagePayload,
    draftRepoState,
    editor,
    onSend,
    planMode,
    canSend,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    setAttachmentError,
    setPreviewAttachment,
  ]);

  const handleStartPlanImplementation = useCallback(async () => {
    const sendPlanImplementation =
      onStartPlanImplementationSend ?? onSend ?? null;

    if (!selectedModelKey || !canSend || !sendPlanImplementation) {
      throw new Error("Select a model before starting implementation.");
    }

    setAttachmentError("");
    setPlanMode("chat");

    await sendPlanImplementation({
      ...(draftRepoState ? { draftRepoState } : {}),
      engine: selectedEngine,
      modelId: selectedModelKey,
      reasoningEffort: selectedReasoningEffort,
      text: IMPLEMENT_PLAN_PROMPT,
      threadMode: "chat",
    });
  }, [
    canSend,
    draftRepoState,
    onSend,
    onStartPlanImplementationSend,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    setAttachmentError,
    setPlanMode,
  ]);

  handleSendRef.current = () => {
    void handleSend();
  };

  useEffect(() => {
    onRegisterStartPlanImplementation?.(handleStartPlanImplementation);

    return () => {
      onRegisterStartPlanImplementation?.(null);
    };
  }, [handleStartPlanImplementation, onRegisterStartPlanImplementation]);

  const disabledMessage =
    selectedEngine === "sentinel" && !modelsQuery.isLoading && !hasModels ? (
      <>
        Connect a provider in{" "}
        <Link className="text-foreground underline" href="/settings/providers">
          Settings
        </Link>
        .
      </>
    ) : null;
  const contextWindowIndicatorProps = useMemo(
    () =>
      contextWindowIndicator
        ? {
            compactionEnabled:
              generalSettingsQuery.data?.contextCompactionEnabled ?? false,
            contextWindowMode: contextWindowIndicator.source,
            compactionWindowPercent:
              generalSettingsQuery.data?.contextCompactionWindowPercent ?? 70,
            contextWindow: contextWindowIndicator.contextWindow,
            inputTokens: contextWindowIndicator.inputTokens,
            modelContextWindow: selectedModel?.contextWindow,
            usedPercent: contextWindowIndicator.usedPercent,
          }
        : null,
    [
      contextWindowIndicator,
      generalSettingsQuery.data?.contextCompactionEnabled,
      generalSettingsQuery.data?.contextCompactionWindowPercent,
      selectedModel?.contextWindow,
    ],
  );
  const modelSelectorNode = useMemo(
    () => (
      <ModelSelector
        availableModels={availableModels}
        isLoading={modelsQuery.isLoading && availableModels.length === 0}
        onSelectModel={handleSelectModel}
        onSelectReasoningEffort={handleSelectReasoningEffort}
        selectedModel={selectedModel}
        selectedModelKey={selectedModelKey}
        selectedReasoningEffort={selectedReasoningEffort}
        supportedReasoningEfforts={supportedReasoningEfforts}
      />
    ),
    [
      availableModels,
      handleSelectModel,
      handleSelectReasoningEffort,
      modelsQuery.isLoading,
      selectedModel,
      selectedModelKey,
      selectedReasoningEffort,
      supportedReasoningEfforts,
    ],
  );
  const showEngineSelector = !canPersistThreadSelection;
  const selectedVoiceProviderLabel =
    voiceSettingsQuery.data?.providers.find(
      (provider) => provider.id === voiceSettingsQuery.data?.voiceInputProvider,
    )?.displayName ?? "voice provider";
  const showVoiceInput = shouldShowVoiceInputControl({
    browserSupported: voiceInput.isSupported,
    voiceInputAvailable:
      Boolean(voiceSettingsQuery.data?.isAvailable) && !isLocked,
  });
  const handleStartVoiceInput = useCallback(() => {
    void voiceInput.start(selectedVoiceProviderLabel);
  }, [selectedVoiceProviderLabel, voiceInput.start]);
  const isModelUiReady =
    Boolean(selectedModelKey) ||
    (!modelsQuery.isLoading && !globalSelectionQuery.isLoading);
  const isComposerReady = Boolean(editor) && hasWorkspace && isModelUiReady;
  const [hideUntilReady, setHideUntilReady] = useState(
    () => !hasComposerBootstrappedThisSession,
  );

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (!hideUntilReady || !isComposerReady) {
      return;
    }

    hasComposerBootstrappedThisSession = true;
    setHideUntilReady(false);
  }, [hideUntilReady, isComposerReady]);

  useEffect(() => {
    if (!isDraggingOver) {
      dragCounterRef.current = 0;
    }
  }, [isDraggingOver]);

  const isFileDragEvent = useCallback(
    (event: ReactDragEvent<HTMLElement>) =>
      event.dataTransfer?.types.includes("Files") ?? false,
    [],
  );

  const handleComposerDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (isLocked || !isFileDragEvent(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDraggingOver(true);
      }
    },
    [isFileDragEvent, isLocked],
  );

  const handleComposerDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (isLocked || !isFileDragEvent(event)) return;
      event.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    },
    [isFileDragEvent, isLocked],
  );

  const handleComposerDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (isLocked || !isFileDragEvent(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [isFileDragEvent, isLocked],
  );

  const handleComposerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (isLocked || !isFileDragEvent(event)) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        addBrowserFiles(Array.from(files));
      }
    },
    [addBrowserFiles, isFileDragEvent, isLocked],
  );

  return (
    <>
      <div
        aria-hidden={hideUntilReady ? true : undefined}
        className="pointer-events-auto relative w-full overflow-hidden rounded-[24px] border border-border/50 bg-background shadow-[0_0_10px_rgba(0,0,0,0.05)] transition-opacity duration-150 dark:border-border/20 dark:bg-surface"
        onDragEnter={handleComposerDragEnter}
        onDragLeave={handleComposerDragLeave}
        onDragOver={handleComposerDragOver}
        onDrop={handleComposerDrop}
        style={{
          opacity: hideUntilReady ? 0 : 1,
          visibility: hideUntilReady ? "hidden" : "visible",
        }}
      >
        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/88 p-6 backdrop-blur-sm dark:bg-surface/90">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
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
              <div className="space-y-1">
                <p className="text-sm font-medium tracking-[0.01em] text-foreground">
                  Drop files to attach
                </p>
                <p className="text-xs text-muted">
                  Release here to add them to this message
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={`px-2.5 py-2 transition-opacity duration-150 ${
            isDraggingOver ? "opacity-0" : "opacity-100"
          }`}
        >
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
            <div className="min-h-[32px]">
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

          {!voiceInput.isActive && voiceInput.errorMessage ? (
            <div className="px-3 pb-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-danger-soft-foreground">
                  {voiceInput.errorMessage}
                </p>
                {voiceInput.hasPermissionRecoveryAction ? (
                  <Button
                    className="h-6 min-w-0 px-2 text-[11px]"
                    onPress={() => {
                      void voiceInput.openPermissionRecovery();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Open Settings
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {voiceInput.isActive ? (
            <VoiceRecorderPanel
              elapsedSeconds={voiceInput.elapsedSeconds}
              errorMessage={voiceInput.errorMessage}
              level={voiceInput.level}
              onCancel={voiceInput.cancel}
              onStop={voiceInput.stop}
              phase={voiceInput.isRecording ? "recording" : "transcribing"}
              providerLabel={selectedVoiceProviderLabel}
            />
          ) : (
            <ComposerToolbar
              canSend={canSend}
              contextWindowIndicator={contextWindowIndicatorProps}
              engineOptions={engineOptions}
              hasWorkspace={hasWorkspace}
              isBusy={isBusy}
              isLocked={isLocked}
              modelSelector={modelSelectorNode}
              onPickFiles={handlePickFiles}
              onSelectEngine={handleSelectEngine}
              onSend={handleSend}
              onStartVoiceInput={handleStartVoiceInput}
              onStop={onStop}
              onTogglePlanMode={handleTogglePlanMode}
              planMode={planMode}
              planModeAvailable={planModeAvailable}
              selectedEngine={selectedEngine}
              selectedModelKey={selectedModelKey}
              showEngineSelector={showEngineSelector}
              showVoiceInput={showVoiceInput}
              voiceInputDisabled={!editor}
            />
          )}
        </div>

        {activeWorkspace ? (
          <div className="overflow-hidden rounded-b-[24px] border-t border-border/25">
            <ComposerWorkspaceBar
              activeWorkspace={activeWorkspace}
              draftPreparedWorktree={draftPreparedWorktree}
              draftProjectMode={draftProjectMode}
              draftThreadId={draftThreadId}
              onDraftPreparedWorktreeChange={onDraftPreparedWorktreeChange}
              onDraftProjectModeChange={onDraftProjectModeChange}
              onSetupPendingChange={setIsRepoSetupPending}
              repoThreadId={repoThreadId}
              showBranchSwitcher={showBranchSwitcher}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

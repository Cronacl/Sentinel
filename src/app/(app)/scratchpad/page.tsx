"use client";

import { ListBox, Popover, ScrollShadow, Spinner } from "@heroui/react";
import {
  ArrowDown01Icon,
  CircleIcon,
  Delete02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import type { RepoProjectMode } from "@/lib/ai/chat/engines/types";
import { useModelSelection } from "@/components/chat/chat-composer/use-model-selection";
import { getReasoningEffortLabel } from "@/components/chat/chat-composer-helpers";
import { usePersistSelection } from "@/components/chat/chat-composer/use-persist-selection";
import { ProviderIcon } from "@/components/icons/provider-icon";
import { SubagentThreadPanel } from "@/components/chat/subagent-thread-panel";
import { useThreadChat } from "@/hooks/use-thread-chat";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { SidebarToggle, useRightSidebar, useShell } from "@/components/shell";
import { getErrorMessage } from "@/lib/errors";
import {
  applyThreadStatusCacheUpdate,
  applyThreadTitleCacheUpdate,
} from "@/lib/threads/cache";
import {
  deriveScratchpadTaskStatus,
  deriveScratchpadTaskTitle,
} from "@/lib/scratchpad/derived";
import type { PermissionMode } from "@/lib/security";
import type { ChatEngine } from "@/server/db/enums";
import { api, type RouterOutputs } from "@/trpc/react";

type ScratchpadTask =
  RouterOutputs["scratchpad"]["getCurrent"]["tasks"][number];

const EMPTY_THREAD_MESSAGES: [] = [];
const EMPTY_QUEUED_FOLLOW_UPS: [] = [];

function formatTaskTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
}

function getPermissionModeLabel(value: PermissionMode) {
  return value === "full" ? "Full" : "Workspace";
}

function getProjectModeLabel(value: RepoProjectMode) {
  return value === "worktree" ? "Worktree" : "Local";
}

function FilledCheckCircle({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="text-foreground/70"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm4.03 7.28a.75.75 0 0 0-1.06-1.06l-4.72 4.72-1.72-1.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l5.25-5.25Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function TaskIndicator({ status }: { status: ScratchpadTask["status"] }) {
  if (status === "completed") {
    return <FilledCheckCircle />;
  }

  if (status === "running") {
    return <Spinner color="current" size="sm" />;
  }

  if (status === "blocked" || status === "failed") {
    return (
      <HugeiconsIcon
        className={status === "failed" ? "text-danger" : "text-warning"}
        color="currentColor"
        icon={Cancel01Icon}
        size={16}
        strokeWidth={1.8}
      />
    );
  }

  return (
    <HugeiconsIcon
      className="text-foreground/20"
      color="currentColor"
      icon={CircleIcon}
      size={16}
      strokeWidth={1.5}
    />
  );
}

function ScratchpadRow({
  isDeleting,
  onDelete,
  onOpen,
  task,
}: {
  isDeleting: boolean;
  onDelete: (taskId: string) => void;
  onOpen: (task: ScratchpadTask) => void;
  task: ScratchpadTask;
}) {
  const titleClass =
    task.status === "completed"
      ? "text-foreground/50 line-through decoration-foreground/15"
      : "text-foreground/90";

  return (
    <div className="group flex items-center">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
        onClick={() => task.isClickable && onOpen(task)}
        type="button"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <TaskIndicator status={task.status} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`shrink-0 text-[14.5px] leading-none ${titleClass}`}>
            {task.title}
          </span>
          {task.status !== "completed" && task.progressText ? (
            <span
              className={`min-w-0 truncate text-xs ${
                task.status === "running"
                  ? "sentinel-thinking-shimmer"
                  : task.status === "blocked"
                    ? "text-warning/70"
                    : task.status === "failed"
                      ? "text-danger/70"
                      : "text-foreground/36"
              }`}
            >
              {task.progressText}
            </span>
          ) : null}
        </span>
      </button>

      <span className="ml-2 hidden shrink-0 self-center text-[11px] leading-none tabular-nums text-foreground/20 lg:block">
        {formatTaskTime(task.createdAt)}
      </span>

      <button
        aria-label="Remove task"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-foreground/0 opacity-0 transition-all hover:text-danger group-hover:text-foreground/25 group-hover:opacity-100"
        disabled={isDeleting}
        onClick={() => onDelete(task.id)}
        type="button"
      >
        {isDeleting ? (
          <Spinner color="current" size="sm" />
        ) : (
          <HugeiconsIcon
            color="currentColor"
            icon={Delete02Icon}
            size={13}
            strokeWidth={1.5}
          />
        )}
      </button>
    </div>
  );
}

function ScratchpadComposer({
  disabled,
  inputRef,
  onChange,
  onSubmit,
  value,
}: {
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  return (
    <form
      className="flex items-center gap-3 py-[9px]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <HugeiconsIcon
        className="shrink-0 text-foreground/20"
        color="currentColor"
        icon={CircleIcon}
        size={16}
        strokeWidth={1.5}
      />
      <input
        autoComplete="off"
        className="w-full bg-transparent text-[14.5px] leading-none text-foreground/80 outline-none placeholder:text-foreground/20"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add a task"
        ref={inputRef}
        value={value}
      />
      {disabled ? (
        <Spinner
          className="shrink-0 text-foreground/30"
          color="current"
          size="sm"
        />
      ) : null}
    </form>
  );
}

function ToolbarPicker({
  ariaLabel,
  children,
  label,
}: {
  ariaLabel: string;
  children: (close: () => void) => React.ReactNode;
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          aria-label={ariaLabel}
          className="group inline-flex h-6 max-w-full items-center gap-1 rounded-lg px-1.5 align-middle text-[12px] font-medium leading-none text-foreground/45 transition-colors hover:text-foreground/78 data-[pressed=true]:text-foreground/85"
          type="button"
        >
          <span className="flex min-w-0 items-center leading-none">
            {label}
          </span>
          <HugeiconsIcon
            className="shrink-0 text-foreground/25 transition-colors group-hover:text-foreground/45"
            color="currentColor"
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
          />
        </button>
      </Popover.Trigger>
      <Popover.Content placement="bottom start">
        <Popover.Dialog className="p-1">
          {children(() => setOpen(false))}
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  );
}

function ToolbarLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center leading-none ${className}`}
    >
      {children}
    </span>
  );
}

function ScratchpadToolbar({
  currentWorkspace,
  engineOptions,
  onSelectPermissionMode,
  onSelectProjectMode,
  onSelectEngine,
  onSelectWorkspace,
  modelSelection,
  permissionMode,
  projectMode,
  selectedEngine,
  supportsWorktreeMode,
  workspaces,
}: {
  currentWorkspace: { id: string; name: string } | null;
  engineOptions: Array<{
    engine: ChatEngine;
    error: string | null;
    isAvailable: boolean;
    label: string;
  }>;
  onSelectPermissionMode: (mode: PermissionMode) => void;
  onSelectProjectMode: (mode: RepoProjectMode) => void;
  onSelectEngine: (engine: ChatEngine) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  modelSelection: ReturnType<typeof useModelSelection>;
  permissionMode: PermissionMode;
  projectMode: RepoProjectMode;
  selectedEngine: ChatEngine;
  supportsWorktreeMode: boolean;
  workspaces: Array<{ id: string; name: string; isSelected: boolean }>;
}) {
  const disabledEngineKeys = useMemo(
    () =>
      engineOptions
        .filter((e) => !e.isAvailable && e.engine !== "sentinel")
        .map((e) => e.engine),
    [engineOptions],
  );

  const supportsReasoning = modelSelection.supportedReasoningEfforts.length > 0;

  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-x-0.5 gap-y-0.5">
      <ToolbarPicker
        ariaLabel="Workspace"
        label={
          <ToolbarLabel className="max-w-[128px] truncate">
            {currentWorkspace?.name ?? "Workspace"}
          </ToolbarLabel>
        }
      >
        {(close) => (
          <ScrollShadow className="max-h-[200px]">
            <ListBox
              aria-label="Workspace"
              selectedKeys={currentWorkspace ? [currentWorkspace.id] : []}
              selectionMode="single"
              onSelectionChange={(keys) => {
                const key = [...keys][0];
                if (key != null) {
                  onSelectWorkspace(String(key));
                  close();
                }
              }}
            >
              {workspaces.map((ws) => (
                <ListBox.Item key={ws.id} id={ws.id} textValue={ws.name}>
                  <span className="truncate text-[12px]">{ws.name}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ScrollShadow>
        )}
      </ToolbarPicker>

      <ToolbarPicker
        ariaLabel="Permissions"
        label={
          <ToolbarLabel>{getPermissionModeLabel(permissionMode)}</ToolbarLabel>
        }
      >
        {(close) => (
          <ListBox
            aria-label="Permissions"
            selectedKeys={[permissionMode]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              if (key != null) {
                onSelectPermissionMode(String(key) as PermissionMode);
                close();
              }
            }}
          >
            <ListBox.Item id="full" key="full" textValue="Full permissions">
              <span className="text-[12px]">Full permissions</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item
              id="default"
              key="default"
              textValue="Workspace permissions"
            >
              <span className="text-[12px]">Workspace permissions</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        )}
      </ToolbarPicker>

      <ToolbarPicker
        ariaLabel="Project mode"
        label={<ToolbarLabel>{getProjectModeLabel(projectMode)}</ToolbarLabel>}
      >
        {(close) => (
          <ListBox
            aria-label="Project mode"
            disabledKeys={supportsWorktreeMode ? [] : ["worktree"]}
            selectedKeys={[projectMode]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              if (key != null) {
                onSelectProjectMode(String(key) as RepoProjectMode);
                close();
              }
            }}
          >
            <ListBox.Item id="local" key="local" textValue="Local project">
              <span className="text-[12px]">Local project</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="worktree" key="worktree" textValue="Worktree">
              <span className="text-[12px]">Worktree</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        )}
      </ToolbarPicker>

      <ToolbarPicker
        ariaLabel="Engine"
        label={
          <ToolbarLabel className="capitalize">{selectedEngine}</ToolbarLabel>
        }
      >
        {(close) => (
          <ListBox
            aria-label="Engine"
            disabledKeys={disabledEngineKeys}
            selectedKeys={[selectedEngine]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              if (key != null) {
                onSelectEngine(String(key) as ChatEngine);
                close();
              }
            }}
          >
            {engineOptions.map((engine) => (
              <ListBox.Item
                key={engine.engine}
                id={engine.engine}
                textValue={engine.label}
              >
                <span className="capitalize text-[12px]">{engine.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        )}
      </ToolbarPicker>

      <ToolbarPicker
        ariaLabel="Model"
        label={
          <ToolbarLabel className="max-w-[148px] truncate">
            {modelSelection.selectedModel?.displayName ??
              modelSelection.selectedModelKey ??
              "Model"}
          </ToolbarLabel>
        }
      >
        {(close) => (
          <ScrollShadow className="max-h-[240px]">
            <ListBox
              aria-label="Model"
              selectedKeys={
                modelSelection.selectedModelKey
                  ? [modelSelection.selectedModelKey]
                  : []
              }
              selectionMode="single"
              onSelectionChange={(keys) => {
                const key = [...keys][0];
                if (key != null) {
                  modelSelection.handleSelectModel(String(key));
                  close();
                }
              }}
            >
              {modelSelection.availableModels.map((model) => (
                <ListBox.Item
                  key={model.modelId}
                  id={model.modelId}
                  textValue={model.displayName}
                >
                  {model.provider ? (
                    <span className="inline-flex h-[10px] w-[10px] shrink-0 items-center justify-center">
                      <ProviderIcon
                        className="h-[10px] w-[10px] shrink-0"
                        provider={model.provider}
                      />
                    </span>
                  ) : null}
                  <span className="truncate text-[12px]">
                    {model.displayName}
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ScrollShadow>
        )}
      </ToolbarPicker>

      {supportsReasoning ? (
        <ToolbarPicker
          ariaLabel="Reasoning effort"
          label={
            <ToolbarLabel>
              {modelSelection.selectedReasoningEffort
                ? getReasoningEffortLabel(
                    modelSelection.selectedReasoningEffort,
                  )
                : "Medium"}
            </ToolbarLabel>
          }
        >
          {(close) => (
            <ListBox
              aria-label="Reasoning effort"
              selectedKeys={
                modelSelection.selectedReasoningEffort
                  ? [modelSelection.selectedReasoningEffort]
                  : []
              }
              selectionMode="single"
              onSelectionChange={(keys) => {
                const key = [...keys][0];
                if (key != null) {
                  modelSelection.handleSelectReasoningEffort(
                    String(key) as Parameters<
                      typeof modelSelection.handleSelectReasoningEffort
                    >[0],
                  );
                  close();
                }
              }}
            >
              {modelSelection.supportedReasoningEfforts.map((effort) => (
                <ListBox.Item
                  key={effort}
                  id={effort}
                  textValue={getReasoningEffortLabel(effort)}
                >
                  <span className="text-[12px]">
                    {getReasoningEffortLabel(effort)}
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          )}
        </ToolbarPicker>
      ) : null}
    </div>
  );
}

function ScratchpadLiveTaskObserver({
  task,
  workspaceId,
}: {
  task: ScratchpadTask;
  workspaceId: string;
}) {
  const utils = api.useUtils();
  const initialSeedRef = useRef({
    activeRunId: task.threadActiveRunId,
    chatEngine: task.threadChatEngine ?? "sentinel",
    threadTitle: task.threadTitle ?? task.title,
    threadStatus: task.threadStatus ?? "idle",
  });
  const handleObserverError = useCallback(() => {
    void utils.scratchpad.getCurrent.invalidate();
  }, [utils]);
  const chat = useThreadChat({
    initialActiveRunId: initialSeedRef.current.activeRunId,
    initialChatEngine: initialSeedRef.current.chatEngine,
    initialMessages: EMPTY_THREAD_MESSAGES,
    initialQueuedFollowUps: EMPTY_QUEUED_FOLLOW_UPS,
    initialThreadStatus: initialSeedRef.current.threadStatus,
    initialThreadTitle: initialSeedRef.current.threadTitle,
    onError: handleObserverError,
    threadId: task.visibleThreadId ?? task.virtualThreadId ?? task.id,
    workspaceId,
  });
  const derivedStatus = useMemo(
    () =>
      deriveScratchpadTaskStatus({
        activeRunId: chat.activeRunId,
        messages: chat.messages,
        persistedProgressText: task.progressText,
        status: task.status,
        threadStatus: chat.threadStatus,
      }),
    [
      chat.activeRunId,
      chat.messages,
      chat.threadStatus,
      task.progressText,
      task.status,
    ],
  );
  const derivedTitle = useMemo(
    () =>
      deriveScratchpadTaskTitle({
        taskTitle: task.title,
        threadTitle: chat.threadTitle,
      }),
    [chat.threadTitle, task.title],
  );
  const previousRunIdRef = useRef(task.threadActiveRunId);
  const previousThreadCacheSyncRef = useRef<{
    status: typeof chat.threadStatus;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!task.visibleThreadId) {
      return;
    }

    utils.scratchpad.getCurrent.setData(undefined, (current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const tasks = current.tasks.map((currentTask) => {
        if (currentTask.id !== task.id) {
          return currentTask;
        }

        const nextTask = {
          ...currentTask,
          progressText: derivedStatus.progressText,
          status: derivedStatus.status,
          threadActiveRunId: chat.activeRunId,
          threadStatus: chat.threadStatus,
          threadTitle: chat.threadTitle,
          title: derivedTitle,
        };

        if (
          currentTask.progressText === nextTask.progressText &&
          currentTask.status === nextTask.status &&
          currentTask.threadActiveRunId === nextTask.threadActiveRunId &&
          currentTask.threadStatus === nextTask.threadStatus &&
          currentTask.threadTitle === nextTask.threadTitle &&
          currentTask.title === nextTask.title
        ) {
          return currentTask;
        }

        changed = true;
        return nextTask;
      });

      return changed ? { ...current, tasks } : current;
    });

    const previousThreadCacheSync = previousThreadCacheSyncRef.current;
    if (
      previousThreadCacheSync?.status !== chat.threadStatus ||
      previousThreadCacheSync.title !== derivedTitle
    ) {
      applyThreadStatusCacheUpdate({
        status: chat.threadStatus,
        threadId: task.visibleThreadId,
        utils,
        workspaceId,
      });
      applyThreadTitleCacheUpdate({
        threadId: task.visibleThreadId,
        title: derivedTitle,
        utils,
        workspaceId,
      });
      previousThreadCacheSyncRef.current = {
        status: chat.threadStatus,
        title: derivedTitle,
      };
    }
  }, [
    chat.activeRunId,
    chat.threadStatus,
    chat.threadTitle,
    derivedStatus.progressText,
    derivedStatus.status,
    derivedTitle,
    handleObserverError,
    task.id,
    task.visibleThreadId,
    utils,
    workspaceId,
  ]);

  useEffect(() => {
    if (previousRunIdRef.current && !chat.activeRunId) {
      void utils.scratchpad.getCurrent.invalidate();
      void utils.threads.list.invalidate();
      void utils.threads.search.invalidate();
    }

    previousRunIdRef.current = chat.activeRunId;
  }, [chat.activeRunId, utils]);

  return null;
}

export default function ScratchpadPage() {
  const { leftSidebarOpen } = useShell();
  const { close, isOpen, open } = useRightSidebar();
  const utils = api.useUtils();
  const composerRef = useRef<HTMLInputElement>(null);
  const workspace = api.workspaces.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
  });
  const workspaceList = api.workspaces.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const scratchpad = api.scratchpad.getCurrent.useQuery(undefined, {
    refetchInterval: 1_500,
  });
  const [draft, setDraft] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [openScratchpadTaskId, setOpenScratchpadTaskId] = useState<
    string | null
  >(null);
  const [openScratchpadThreadId, setOpenScratchpadThreadId] = useState<
    string | null
  >(null);
  const syncedTaskTitlesRef = useRef(new Map<string, string>());
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("full");
  const [projectMode, setProjectMode] = useState<RepoProjectMode>("local");

  const persistHook = usePersistSelection({
    activeWorkspaceId: workspace.data?.id,
    canPersistThreadSelection: false,
  });

  const modelSelection = useModelSelection({
    globalSelectionQuery: persistHook.globalSelectionQuery,
    persistEngineSelection: persistHook.persistEngineSelection,
    persistSelection: persistHook.persistSelection,
    selectionScopeKey: "scratchpad",
  });
  const repoContext = api.repo.getThreadGitState.useQuery(
    { workspaceId: workspace.data?.id ?? "" },
    {
      enabled: Boolean(workspace.data?.id),
      staleTime: 15_000,
    },
  );

  const selectWorkspace = api.workspaces.select.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previousCurrent = utils.workspaces.getCurrent.getData();
      const previousList = utils.workspaces.list.getData();

      const nextWorkspace = previousList?.find((w) => w.id === workspaceId);
      if (nextWorkspace) {
        utils.workspaces.getCurrent.setData(undefined, {
          createdAt: nextWorkspace.createdAt,
          description: nextWorkspace.description,
          id: nextWorkspace.id,
          isArchived: false,
          isExpanded: nextWorkspace.isExpanded,
          kind: nextWorkspace.kind,
          name: nextWorkspace.name,
          permissionModeOverride: nextWorkspace.permissionModeOverride,
          rootPath: nextWorkspace.rootPath,
          sortOrder: nextWorkspace.sortOrder,
          updatedAt: nextWorkspace.updatedAt,
          userId: "",
        });
      }
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((w) => ({ ...w, isSelected: w.id === workspaceId })),
      );

      return { previousCurrent, previousList };
    },
    onError: (_error, _input, context) => {
      if (context?.previousCurrent) {
        utils.workspaces.getCurrent.setData(undefined, context.previousCurrent);
      }
      if (context?.previousList) {
        utils.workspaces.list.setData(undefined, context.previousList);
      }
    },
    onSettled: () => {
      void utils.workspaces.getCurrent.invalidate();
      void utils.workspaces.list.invalidate();
      void utils.scratchpad.getCurrent.invalidate();
    },
  });

  const createTask = api.scratchpad.createTask.useMutation({
    onMutate: async ({ title }) => {
      await utils.scratchpad.getCurrent.cancel();
      const previous = utils.scratchpad.getCurrent.getData();
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date();

      utils.scratchpad.getCurrent.setData(undefined, (current) => ({
        hubThreadId: current?.hubThreadId ?? null,
        id: current?.id ?? null,
        tasks: [
          {
            createdAt: now,
            id: optimisticId,
            isClickable: false,
            progressText: "Thinking",
            status: "running" as const,
            threadActiveRunId: null,
            threadChatEngine: null,
            threadStatus: null,
            threadTitle: title,
            title,
            updatedAt: now,
            virtualThreadId: null,
            visibleThreadId: null,
          },
          ...(current?.tasks ?? []),
        ],
        workspaceId: current?.workspaceId ?? workspace.data?.id ?? "",
      }));

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.scratchpad.getCurrent.setData(undefined, context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        utils.threads.list.invalidate(),
        utils.threads.search.invalidate(),
        utils.workspaces.list.invalidate(),
      ]);
    },
    onSettled: () => {
      void utils.scratchpad.getCurrent.invalidate();
    },
  });

  const deleteTask = api.scratchpad.deleteTask.useMutation({
    onMutate: async ({ taskId }) => {
      await utils.scratchpad.getCurrent.cancel();
      const previous = utils.scratchpad.getCurrent.getData();

      utils.scratchpad.getCurrent.setData(undefined, (current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.filter((task) => task.id !== taskId),
            }
          : current,
      );

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.scratchpad.getCurrent.setData(undefined, context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        utils.threads.list.invalidate(),
        utils.threads.search.invalidate(),
        utils.workspaces.list.invalidate(),
      ]);
    },
    onSettled: () => {
      setDeletingTaskId(null);
      void utils.scratchpad.getCurrent.invalidate();
    },
  });

  const toggleComplete = api.scratchpad.toggleTaskComplete.useMutation({
    onMutate: async ({ taskId, completed }) => {
      await utils.scratchpad.getCurrent.cancel();
      const previous = utils.scratchpad.getCurrent.getData();

      utils.scratchpad.getCurrent.setData(undefined, (current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      progressText: completed
                        ? (task.progressText ?? "Completed")
                        : null,
                      status: (completed
                        ? "completed"
                        : "pending") as ScratchpadTask["status"],
                      updatedAt: new Date(),
                    }
                  : task,
              ),
            }
          : current,
      );

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.scratchpad.getCurrent.setData(undefined, context.previous);
      }
    },
    onSettled: () => {
      void utils.scratchpad.getCurrent.invalidate();
    },
  });

  const allTasks = useMemo(
    () => scratchpad.data?.tasks ?? [],
    [scratchpad.data?.tasks],
  );

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setOpenScratchpadTaskId(null);
    setOpenScratchpadThreadId(null);
  }, [isOpen]);

  useEffect(() => {
    const nextSyncedTitles = new Map<string, string>();
    const workspaceId = scratchpad.data?.workspaceId ?? workspace.data?.id;

    for (const task of allTasks) {
      const visibleThreadId = task.visibleThreadId;
      const title = task.title.trim();
      const signature = `${visibleThreadId ?? "none"}:${title}`;

      nextSyncedTitles.set(task.id, signature);

      if (
        !visibleThreadId ||
        !title ||
        syncedTaskTitlesRef.current.get(task.id) === signature
      ) {
        continue;
      }

      applyThreadTitleCacheUpdate({
        threadId: visibleThreadId,
        title,
        utils,
        workspaceId,
      });
    }

    syncedTaskTitlesRef.current = nextSyncedTitles;
  }, [allTasks, scratchpad.data?.workspaceId, utils, workspace.data?.id]);

  useEffect(() => {
    if (
      projectMode === "worktree" &&
      !(repoContext.data?.isGitRepo && repoContext.data?.branch) &&
      !repoContext.isFetching
    ) {
      setProjectMode("local");
    }
  }, [
    projectMode,
    repoContext.data?.branch,
    repoContext.data?.isGitRepo,
    repoContext.isFetching,
    setProjectMode,
  ]);

  const handleCreateTask = useCallback(() => {
    const title = draft.trim();
    if (!title || createTask.isPending) {
      return;
    }

    setDraft("");
    createTask.mutate(
      {
        title,
        ...(modelSelection.selectedEngine !== "sentinel"
          ? { engine: modelSelection.selectedEngine }
          : {}),
        ...(modelSelection.selectedModelKey
          ? { modelId: modelSelection.selectedModelKey }
          : {}),
        permissionModeOverride: permissionMode,
        projectMode,
        ...(modelSelection.selectedReasoningEffort
          ? { reasoningEffort: modelSelection.selectedReasoningEffort }
          : {}),
      },
      {
        onError: (error) => {
          setDraft(title);
          sileo.error({
            description: getErrorMessage(
              error,
              "Unable to add the Scratchpad task.",
            ),
          });
        },
      },
    );
  }, [
    createTask,
    draft,
    modelSelection.selectedEngine,
    modelSelection.selectedModelKey,
    modelSelection.selectedReasoningEffort,
    permissionMode,
    projectMode,
  ]);

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const task = allTasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }

      setDeletingTaskId(taskId);

      void (async () => {
        const isOpenDeletedTask =
          isOpen &&
          openScratchpadTaskId === taskId &&
          openScratchpadThreadId != null;

        if (isOpenDeletedTask) {
          try {
            const response = await fetch("/api/chat", {
              body: JSON.stringify({
                id: openScratchpadThreadId,
                trigger: "stop-stream",
                workspaceId:
                  scratchpad.data?.workspaceId ?? workspace.data?.id ?? "",
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });

            if (!response.ok) {
              throw new Error("Unable to stop the Scratchpad task.");
            }
          } catch {
            // Deleting the task is the primary action; continue even if stop fails.
          }

          close();
          setOpenScratchpadTaskId(null);
          setOpenScratchpadThreadId(null);
        }

        deleteTask.mutate(
          { taskId },
          {
            onError: (error) => {
              sileo.error({
                description: getErrorMessage(
                  error,
                  "Unable to remove the task.",
                ),
              });
            },
          },
        );
      })();
    },
    [
      allTasks,
      close,
      deleteTask,
      isOpen,
      openScratchpadTaskId,
      openScratchpadThreadId,
      scratchpad.data?.workspaceId,
      workspace.data?.id,
    ],
  );

  const handleToggleComplete = useCallback(
    (taskId: string) => {
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return;
      const completed = task.status !== "completed";
      toggleComplete.mutate({ completed, taskId });
    },
    [allTasks, toggleComplete],
  );

  const handleOpenTask = useCallback(
    async (task: ScratchpadTask) => {
      if (!task.isClickable) {
        return;
      }

      try {
        const result = await utils.scratchpad.resolveTaskThread.fetch({
          taskId: task.id,
        });

        if (!result.threadId) {
          return;
        }

        setOpenScratchpadTaskId(task.id);
        setOpenScratchpadThreadId(result.threadId);
        open(
          <SubagentThreadPanel hideDescription threadId={result.threadId} />,
          { size: "wide" },
        );
      } catch (error) {
        sileo.error({
          description: getErrorMessage(
            error,
            "Unable to open the Scratchpad task details.",
          ),
        });
      }
    },
    [open, utils.scratchpad.resolveTaskThread],
  );

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      selectWorkspace.mutate({ workspaceId });
    },
    [selectWorkspace],
  );

  const currentWorkspace = workspace.data
    ? { id: workspace.data.id, name: workspace.data.name }
    : null;

  const workspaces = useMemo(
    () =>
      (workspaceList.data ?? []).map((w) => ({
        id: w.id,
        isSelected: w.isSelected,
        name: w.name,
      })),
    [workspaceList.data],
  );

  return (
    <SettingsPageWrapper
      title={
        <div>
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          Scratchpad
        </div>
      }
    >
      {scratchpad.error ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-2xl border px-3 py-2.5 text-xs">
          {scratchpad.error.message}
        </p>
      ) : null}

      <div className="relative">
        {allTasks
          .filter(
            (task) =>
              Boolean(task.visibleThreadId) && Boolean(task.threadActiveRunId),
          )
          .map((task) => (
            <ScratchpadLiveTaskObserver
              key={`${task.id}:${task.threadActiveRunId ?? "idle"}`}
              task={task}
              workspaceId={
                scratchpad.data?.workspaceId ?? workspace.data?.id ?? ""
              }
            />
          ))}

        {scratchpad.isPending && !scratchpad.data ? (
          <div className="flex items-center gap-2 py-1 text-sm text-foreground/40">
            <Spinner color="current" size="sm" />
            <span>Loading...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {allTasks.map((task) => (
              <ScratchpadRow
                isDeleting={deletingTaskId === task.id}
                key={task.id}
                onDelete={handleDeleteTask}
                onOpen={handleOpenTask}
                task={task}
              />
            ))}
          </div>
        )}

        <ScratchpadComposer
          disabled={createTask.isPending}
          inputRef={composerRef}
          onChange={setDraft}
          onSubmit={handleCreateTask}
          value={draft}
        />

        <ScratchpadToolbar
          currentWorkspace={currentWorkspace}
          engineOptions={modelSelection.engineOptions}
          modelSelection={modelSelection}
          onSelectPermissionMode={setPermissionMode}
          onSelectProjectMode={setProjectMode}
          onSelectEngine={modelSelection.handleSelectEngine}
          onSelectWorkspace={handleSelectWorkspace}
          permissionMode={permissionMode}
          projectMode={projectMode}
          selectedEngine={modelSelection.selectedEngine}
          supportsWorktreeMode={Boolean(
            repoContext.data?.isGitRepo && repoContext.data?.branch,
          )}
          workspaces={workspaces}
        />

        {!scratchpad.isPending && allTasks.length === 0 ? (
          <p className="pb-6 pt-2 text-[13px] text-foreground/22">
            Hit Enter to run it.
          </p>
        ) : null}
      </div>
    </SettingsPageWrapper>
  );
}

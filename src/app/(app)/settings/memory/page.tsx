"use client";

import {
  AlertDialog,
  Button,
  Chip,
  Form,
  Skeleton,
  Spinner,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AiIdeaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ControlledNumberField,
  ControlledSelectField,
  ControlledSwitchField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  DEFAULT_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
  DEFAULT_MEMORY_RETRIEVAL_LIMIT,
  DEFAULT_MEMORY_SCOPE,
  MEMORY_KIND_VALUES,
  MEMORY_SCOPE_VALUES,
} from "@/lib/memory";
import {
  getMemoryEmbeddingProfile,
  MEMORY_EMBEDDING_PROFILES,
} from "@/lib/memory/profiles";
import {
  memorySettingsFormSchema,
  type MemorySettingsFormValues,
} from "@/schemas/memory-settings.schema";
import { api } from "@/trpc/react";

type ConfirmAction = "clear" | "reindex" | null;
type ManagedMemoryItem = {
  content: string;
  id: string;
  summary: string | null;
};

const KIND_OPTIONS = [
  { label: "All kinds", value: "all" },
  ...MEMORY_KIND_VALUES.map((value) => ({
    label: value[0]?.toUpperCase() + value.slice(1),
    value,
  })),
];

const SCOPE_FILTER_OPTIONS = [
  { label: "All scopes", value: "all" },
  { label: "Global", value: "global" },
  { label: "Workspace", value: "workspace" },
];

const PINNED_OPTIONS = [
  { label: "All items", value: "all" },
  { label: "Pinned only", value: "pinned" },
  { label: "Unpinned", value: "unpinned" },
];

type MemoryProfileOption = {
  description: string;
  label: string;
  value: MemorySettingsFormValues["memoryProfileId"];
};

function MemorySettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </section>
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-24 w-full rounded-xl" key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function MemorySettingsPage() {
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "workspace">(
    "all",
  );
  const [kindFilter, setKindFilter] = useState<"all" | (typeof MEMORY_KIND_VALUES)[number]>(
    "all",
  );
  const [pinnedFilter, setPinnedFilter] = useState<"all" | "pinned" | "unpinned">(
    "all",
  );
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingDeleteMemory, setPendingDeleteMemory] =
    useState<ManagedMemoryItem | null>(null);
  const [actionError, setActionError] = useState("");
  const deferredQuery = useDeferredValue(query);

  const memorySettings = api.memorySettings.get.useQuery();
  const providerStatuses = api.providers.list.useQuery();
  const workspaces = api.workspaces.list.useQuery();
  const memories = api.memory.list.useQuery({
    ...(deferredQuery.trim() ? { query: deferredQuery.trim() } : {}),
    ...(scopeFilter !== "all" ? { scope: scopeFilter } : {}),
    ...(kindFilter !== "all" ? { kind: kindFilter } : {}),
    ...(workspaceFilter !== "all" ? { workspaceId: workspaceFilter } : {}),
    ...(pinnedFilter === "pinned"
      ? { pinned: true }
      : pinnedFilter === "unpinned"
        ? { pinned: false }
        : {}),
  });

  const form = useForm<MemorySettingsFormValues>({
    defaultValues: {
      autoSaveEnabled: true,
      autoSavePerTurnLimit: DEFAULT_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
      defaultScope: DEFAULT_MEMORY_SCOPE,
      enabled: false,
      memoryProfileId: "openai:text-embedding-3-small",
      retrievalLimit: DEFAULT_MEMORY_RETRIEVAL_LIMIT,
    },
    resolver: zodResolver(memorySettingsFormSchema),
  });

  const activeProviderIds = useMemo(
    () =>
      new Set(
        (providerStatuses.data ?? [])
          .filter((provider) => provider.status === "active")
          .map((provider) => provider.id),
      ),
    [providerStatuses.data],
  );

  const profileOptions = useMemo(() => {
    const currentProfile = memorySettings.data
      ? getMemoryEmbeddingProfile(
          memorySettings.data.memoryProvider,
          memorySettings.data.memoryModel,
        )
      : null;

    const options: MemoryProfileOption[] = MEMORY_EMBEDDING_PROFILES.filter(
      (profile) => activeProviderIds.has(profile.provider),
    ).map((profile) => ({
      description: `${profile.provider} • ${profile.dimensions} dims`,
      label: profile.displayName,
      value: profile.id,
    }));

    if (
      currentProfile &&
      !options.some((option) => option.value === currentProfile.id)
    ) {
      options.unshift({
        description: "Current profile is not available until its provider is active.",
        label: `${currentProfile.displayName} (Unavailable)`,
        value: currentProfile.id,
      });
    }

    return options;
  }, [activeProviderIds, memorySettings.data]);

  useEffect(() => {
    if (!memorySettings.data) {
      return;
    }

    const profile =
      getMemoryEmbeddingProfile(
        memorySettings.data.memoryProvider,
        memorySettings.data.memoryModel,
      ) ?? MEMORY_EMBEDDING_PROFILES[0];

    form.reset({
      autoSaveEnabled: memorySettings.data.autoSaveEnabled,
      autoSavePerTurnLimit: memorySettings.data.autoSavePerTurnLimit,
      defaultScope: memorySettings.data.defaultScope,
      enabled: memorySettings.data.enabled,
      memoryProfileId: profile.id,
      retrievalLimit: memorySettings.data.retrievalLimit,
    });
  }, [form, memorySettings.data]);

  const updateSettings = api.memorySettings.update.useMutation({
    onSuccess: (data) => {
      setActionError("");
      utils.memorySettings.get.setData(undefined, data);
      const profile =
        getMemoryEmbeddingProfile(data.memoryProvider, data.memoryModel) ??
        MEMORY_EMBEDDING_PROFILES[0];
      form.reset({
        autoSaveEnabled: data.autoSaveEnabled,
        autoSavePerTurnLimit: data.autoSavePerTurnLimit,
        defaultScope: data.defaultScope,
        enabled: data.enabled,
        memoryProfileId: profile.id,
        retrievalLimit: data.retrievalLimit,
      });
    },
    onError: (error) => {
      setActionError(error.message);
    },
  });

  const clearAll = api.memory.clearAll.useMutation({
    onSuccess: async () => {
      setActionError("");
      setConfirmAction(null);
      await Promise.all([
        utils.memory.list.invalidate(),
        utils.memorySettings.get.invalidate(),
      ]);
    },
    onError: (error) => {
      setActionError(error.message);
    },
  });

  const reindex = api.memory.reindex.useMutation({
    onSuccess: async () => {
      setActionError("");
      setConfirmAction(null);
      await Promise.all([
        utils.memory.list.invalidate(),
        utils.memorySettings.get.invalidate(),
      ]);
    },
    onError: (error) => {
      setActionError(error.message);
    },
  });

  const deleteMemory = api.memory.delete.useMutation({
    onSuccess: async () => {
      setPendingDeleteMemory(null);
      await utils.memory.list.invalidate();
    },
    onError: (error) => {
      setActionError(error.message);
      setPendingDeleteMemory(null);
    },
  });

  const togglePinned = api.memory.togglePinned.useMutation({
    onSuccess: async () => {
      await utils.memory.list.invalidate();
    },
  });

  const handleSubmit = async (values: MemorySettingsFormValues) => {
    setActionError("");
    await updateSettings.mutateAsync(values);
  };

  const totalMemories = memories.data?.total ?? 0;
  const selectedProfile =
    MEMORY_EMBEDDING_PROFILES.find(
      (profile) => profile.id === form.watch("memoryProfileId"),
    ) ?? null;
  const currentProfile = memorySettings.data
    ? getMemoryEmbeddingProfile(
        memorySettings.data.memoryProvider,
        memorySettings.data.memoryModel,
      )
    : null;
  const profileChanged =
    selectedProfile !== null &&
    currentProfile !== null &&
    selectedProfile.id !== currentProfile.id;
  const isBusy =
    updateSettings.isPending ||
    clearAll.isPending ||
    reindex.isPending ||
    deleteMemory.isPending ||
    togglePinned.isPending;

  return (
    <SettingsPageWrapper
      subtitle="Configure long-term memory, choose the embedding profile, and manage what Sentinel keeps for future chats."
      title="Memory"
    >
      {memorySettings.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {memorySettings.error.message}
        </p>
      ) : null}

      {actionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {actionError}
        </p>
      ) : null}

      {memorySettings.isPending && !memorySettings.data ? (
        <MemorySettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <Form onSubmit={form.handleSubmit(handleSubmit)}>
            <section className="border-separator bg-surface rounded-xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Memory settings
                </h2>
                <p className="text-muted text-sm">
                  Memory works only when a supported AI provider is configured
                  and active.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledSwitchField
                  control={form.control}
                  description="Allow Sentinel to retrieve and use long-term memory during chat."
                  label="Enable memory"
                  name="enabled"
                  switchProps={{ isDisabled: isBusy, size: "sm" }}
                />

                <ControlledSwitchField
                  control={form.control}
                  description="Extract durable facts after successful assistant turns."
                  label="Automatic memory saving"
                  name="autoSaveEnabled"
                  switchProps={{
                    isDisabled: isBusy || !form.watch("enabled"),
                    size: "sm",
                  }}
                />

                <ControlledSelectField
                  control={form.control}
                  description="Choose which memory store Sentinel prefers when a tool does not force the scope."
                  label="Default scope"
                  name="defaultScope"
                  options={MEMORY_SCOPE_VALUES.map((value) => ({
                    label: value[0]?.toUpperCase() + value.slice(1),
                    value,
                  }))}
                  selectProps={{ isDisabled: isBusy }}
                />

                <ControlledNumberField
                  control={form.control}
                  description="Maximum number of retrieved memories injected into a conversation."
                  inputProps={{ className: "w-full" }}
                  label="Retrieval limit"
                  name="retrievalLimit"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: isBusy,
                    maxValue: 12,
                    minValue: 1,
                  }}
                />

                <ControlledNumberField
                  control={form.control}
                  description="Maximum number of memories Sentinel may save after one assistant turn."
                  inputProps={{ className: "w-full" }}
                  label="Auto-save per turn"
                  name="autoSavePerTurnLimit"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: isBusy || !form.watch("autoSaveEnabled"),
                    maxValue: 6,
                    minValue: 1,
                  }}
                />

                <ControlledSelectField
                  control={form.control}
                  description={
                    profileOptions.length > 0
                      ? "Embedding profiles come from your configured AI providers."
                      : "No supported embedding providers are active yet. Configure OpenAI in Settings > Providers."
                  }
                  label="Embedding profile"
                  name="memoryProfileId"
                  options={profileOptions}
                  selectProps={{
                    isDisabled: isBusy || profileOptions.length === 0,
                  }}
                />

                {selectedProfile ? (
                  <div className="border-separator bg-background/60 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={AiIdeaIcon}
                      size={14}
                      strokeWidth={1.5}
                    />
                    <span className="text-muted">
                      {selectedProfile.provider} • {selectedProfile.model} •{" "}
                      {selectedProfile.dimensions} dimensions
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    isDisabled={isBusy || totalMemories === 0}
                    onPress={() => setConfirmAction("clear")}
                    size="sm"
                    type="button"
                    variant="tertiary"
                  >
                    Clear all memory
                  </Button>
                  <Button
                    isDisabled={
                      isBusy || totalMemories === 0 || !profileChanged
                    }
                    onPress={() => setConfirmAction("reindex")}
                    size="sm"
                    type="button"
                    variant="tertiary"
                  >
                    Reindex memory
                  </Button>
                </div>

                <Button
                  isDisabled={
                    isBusy ||
                    !form.formState.isDirty ||
                    profileOptions.length === 0
                  }
                  isPending={updateSettings.isPending}
                  size="sm"
                  type="submit"
                >
                  Save changes
                </Button>
              </div>
            </section>
          </Form>

          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Memory manager
                </h2>
                <p className="text-muted text-sm">
                  {totalMemories} stored mem{totalMemories === 1 ? "ory" : "ories"}
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted text-xs font-medium uppercase tracking-wide">
                  Search
                </span>
                <input
                  className="border-separator bg-background/70 text-foreground placeholder:text-muted/70 w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search memory content or summaries"
                  value={query}
                />
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium uppercase tracking-wide">
                  Workspace
                </span>
                <select
                  className="border-separator bg-background/70 text-foreground w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) => setWorkspaceFilter(event.target.value)}
                  value={workspaceFilter}
                >
                  <option value="all">All workspaces</option>
                  {(workspaces.data ?? []).map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium uppercase tracking-wide">
                  Scope
                </span>
                <select
                  className="border-separator bg-background/70 text-foreground w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) =>
                    setScopeFilter(event.target.value as typeof scopeFilter)
                  }
                  value={scopeFilter}
                >
                  {SCOPE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium uppercase tracking-wide">
                  Kind
                </span>
                <select
                  className="border-separator bg-background/70 text-foreground w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) =>
                    setKindFilter(event.target.value as typeof kindFilter)
                  }
                  value={kindFilter}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium uppercase tracking-wide">
                  Pinned
                </span>
                <select
                  className="border-separator bg-background/70 text-foreground w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) =>
                    setPinnedFilter(event.target.value as typeof pinnedFilter)
                  }
                  value={pinnedFilter}
                >
                  {PINNED_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-3">
              {memories.isPending && !memories.data ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton className="h-28 w-full rounded-xl" key={index} />
                ))
              ) : memories.data?.items.length ? (
                memories.data.items.map((memory) => (
                  <article
                    className="border-separator bg-background/40 rounded-xl border p-4"
                    key={memory.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip size="sm" variant="soft">
                            {memory.kind}
                          </Chip>
                          <Chip
                            color={memory.scope === "workspace" ? "warning" : "default"}
                            size="sm"
                            variant="soft"
                          >
                            {memory.scope}
                          </Chip>
                          {memory.isPinned ? (
                            <Chip color="success" size="sm" variant="soft">
                              Pinned
                            </Chip>
                          ) : null}
                        </div>

                        <p className="text-foreground text-sm leading-6">
                          {memory.content}
                        </p>

                        {memory.summary ? (
                          <p className="text-muted text-sm">{memory.summary}</p>
                        ) : null}

                        <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span>ID: {memory.id}</span>
                          <span>
                            Workspace: {memory.workspaceName ?? "Global memory"}
                          </span>
                          <span>
                            Thread: {memory.threadTitle ?? "Unknown thread"}
                          </span>
                          <span>
                            Last used: {formatDate(memory.lastAccessedAt)}
                          </span>
                          <span>
                            Updated: {formatDate(memory.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          isDisabled={isBusy}
                          isPending={
                            togglePinned.isPending &&
                            togglePinned.variables?.memoryId === memory.id
                          }
                          onPress={() =>
                            togglePinned.mutate({
                              isPinned: !memory.isPinned,
                              memoryId: memory.id,
                            })
                          }
                          size="sm"
                          variant="tertiary"
                        >
                          {memory.isPinned ? "Unpin" : "Pin"}
                        </Button>
                        <Button
                          isDisabled={isBusy}
                          isPending={
                            deleteMemory.isPending &&
                            deleteMemory.variables?.memoryId === memory.id
                          }
                          onPress={() => setPendingDeleteMemory(memory)}
                          size="sm"
                          variant="danger"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="border-separator bg-background/40 rounded-xl border px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No memories matched these filters.
                  </p>
                  <p className="text-muted mt-1 text-sm">
                    Saved memory will appear here once Sentinel starts storing
                    durable context.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <AlertDialog.Backdrop
        isOpen={confirmAction !== null || pendingDeleteMemory !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setConfirmAction(null);
            setPendingDeleteMemory(null);
          }
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[460px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>
                {pendingDeleteMemory
                  ? "Delete memory?"
                  : confirmAction === "clear"
                    ? "Clear memory?"
                    : "Reindex memory?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {pendingDeleteMemory ? (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground">
                    This permanently removes this stored memory.
                  </p>
                  <p className="text-muted">
                    {pendingDeleteMemory.summary ?? pendingDeleteMemory.content}
                  </p>
                </div>
              ) : confirmAction === "clear" ? (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground">
                    This removes every stored memory for your account.
                  </p>
                  <p className="text-muted">
                    Use this when you want a clean slate or before switching to
                    a new embedding profile without reindexing.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground">
                    Reindex all memory using{" "}
                    <span className="font-medium">
                      {selectedProfile?.displayName ?? "the selected profile"}
                    </span>
                    .
                  </p>
                  <p className="text-muted">
                    This rebuilds every memory embedding so future recall uses
                    the new profile consistently.
                  </p>
                </div>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={isBusy}
                onPress={() => {
                  setConfirmAction(null);
                  setPendingDeleteMemory(null);
                }}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={
                  clearAll.isPending ||
                  reindex.isPending ||
                  deleteMemory.isPending
                }
                onPress={() => {
                  if (pendingDeleteMemory) {
                    void deleteMemory.mutate({
                      memoryId: pendingDeleteMemory.id,
                    });
                    return;
                  }

                  if (confirmAction === "clear") {
                    void clearAll.mutate({
                      ...(selectedProfile ? { nextProfileId: selectedProfile.id } : {}),
                    });
                    return;
                  }

                  if (selectedProfile) {
                    void reindex.mutate({ nextProfileId: selectedProfile.id });
                  }
                }}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    {pendingDeleteMemory
                      ? "Delete"
                      : confirmAction === "clear"
                        ? "Clear all"
                        : "Reindex"}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </SettingsPageWrapper>
  );
}

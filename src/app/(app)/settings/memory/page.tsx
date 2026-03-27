"use client";

import {
  AlertDialog,
  Button,
  Chip,
  Form,
  Pagination,
  Skeleton,
  Spinner,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AiIdeaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

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

const PINNED_OPTIONS = [
  { label: "All items", value: "all" },
  { label: "Pinned only", value: "pinned" },
  { label: "Unpinned", value: "unpinned" },
];

const MEMORIES_PER_PAGE = 10;

type MemoryProfileOption = {
  description: string;
  label: string;
  value: MemorySettingsFormValues["memoryProfileId"];
};

type BrowseChipOption<TValue extends string> = {
  count: number;
  label: string;
  value: TValue;
};

function MemorySettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator/20 bg-surface rounded-2xl border p-5">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </section>
      <section className="border-separator/20 bg-surface rounded-2xl border p-5">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-24 w-full rounded-xl" key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function getPageNumbers(page: number, totalPages: number) {
  const pages: (number | "ellipsis")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  pages.push(1);
  if (page > 3) pages.push("ellipsis");

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);

  return pages;
}

function MemoryPagination({
  page,
  totalPages,
  startItem,
  endItem,
  filteredCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  filteredCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <Pagination className="mt-4 w-full" size="sm">
      <Pagination.Summary>
        Showing {startItem}–{endItem} of {filteredCount} memories
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            isDisabled={page === 1}
            onPress={() => onPageChange(page - 1)}
          >
            <Pagination.PreviousIcon />
            <span>Previous</span>
          </Pagination.Previous>
        </Pagination.Item>
        {getPageNumbers(page, totalPages).map((p, i) =>
          p === "ellipsis" ? (
            <Pagination.Item key={`ellipsis-${i}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={p}>
              <Pagination.Link
                isActive={p === page}
                onPress={() => onPageChange(p)}
              >
                {p}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={page === totalPages}
            onPress={() => onPageChange(page + 1)}
          >
            <span>Next</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

function MemoryBrowseChips<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  options: BrowseChipOption<TValue>[];
  value: TValue;
}) {
  return (
    <div className="space-y-2">
      <span className="text-muted text-xs font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <Button
              className="rounded-full"
              key={option.value}
              onPress={() => onChange(option.value)}
              size="sm"
              variant={isActive ? "primary" : "tertiary"}
            >
              <span>{option.label}</span>
              <span
                className={
                  isActive
                    ? "rounded-full bg-background/20 px-2 py-0.5 text-[11px]"
                    : "rounded-full bg-foreground/8 px-2 py-0.5 text-[11px]"
                }
              >
                {option.count}
              </span>
            </Button>
          );
        })}
      </div>
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
  const [scopeFilter, setScopeFilter] = useState<
    "all" | "global" | "workspace"
  >("all");
  const [kindFilter, setKindFilter] = useState<
    "all" | (typeof MEMORY_KIND_VALUES)[number]
  >("all");
  const [pinnedFilter, setPinnedFilter] = useState<
    "all" | "pinned" | "unpinned"
  >("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingDeleteMemory, setPendingDeleteMemory] =
    useState<ManagedMemoryItem | null>(null);
  const [actionError, setActionError] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, scopeFilter, kindFilter, pinnedFilter, workspaceFilter]);

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
  const kindFacetCounts = memories.data?.facets.kindCounts;
  const scopeFacetCounts = memories.data?.facets.scopeCounts;

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

  const availableProfileOptions = useMemo(
    () =>
      MEMORY_EMBEDDING_PROFILES.filter((profile) =>
        activeProviderIds.has(profile.provider),
      ).map((profile) => ({
        description: `${profile.provider} • ${profile.dimensions} dims`,
        label: profile.displayName,
        value: profile.id,
      })),
    [activeProviderIds],
  );

  const hasEligibleMemoryProvider = availableProfileOptions.length > 0;

  const profileOptions = useMemo(() => {
    const currentProfile = memorySettings.data
      ? getMemoryEmbeddingProfile(
          memorySettings.data.memoryProvider,
          memorySettings.data.memoryModel,
        )
      : null;

    const options: MemoryProfileOption[] = [...availableProfileOptions];

    if (
      currentProfile &&
      !options.some((option) => option.value === currentProfile.id)
    ) {
      options.unshift({
        description:
          "Current profile is not available until its provider is active.",
        label: `${currentProfile.displayName} (Unavailable)`,
        value: currentProfile.id,
      });
    }

    return options;
  }, [availableProfileOptions, memorySettings.data]);

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
      enabled: memorySettings.data.enabled && hasEligibleMemoryProvider,
      memoryProfileId: profile.id,
      retrievalLimit: memorySettings.data.retrievalLimit,
    });
  }, [form, hasEligibleMemoryProvider, memorySettings.data]);

  useEffect(() => {
    if (hasEligibleMemoryProvider || !form.getValues("enabled")) {
      return;
    }

    form.setValue("enabled", false, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [form, hasEligibleMemoryProvider]);

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
      sileo.success({ description: "Memory settings saved." });
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
      sileo.success({ description: "All memories cleared." });
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
      sileo.success({ description: "Memory reindexed." });
    },
    onError: (error) => {
      setActionError(error.message);
    },
  });

  const deleteMemory = api.memory.delete.useMutation({
    onSuccess: async () => {
      setPendingDeleteMemory(null);
      await utils.memory.list.invalidate();
      sileo.success({ description: "Memory deleted." });
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
    onError: (error) => {
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update pin status.",
      });
    },
  });

  const handleSubmit = async (values: MemorySettingsFormValues) => {
    setActionError("");
    await updateSettings.mutateAsync({
      ...values,
      enabled:
        values.enabled &&
        availableProfileOptions.some(
          (option) => option.value === values.memoryProfileId,
        ),
    });
  };

  const totalMemories = memories.data?.total ?? 0;
  const allItems = memories.data?.items ?? [];
  const filteredCount = memories.data?.filteredTotal ?? allItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / MEMORIES_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * MEMORIES_PER_PAGE;
  const paginatedItems = allItems.slice(
    startIndex,
    startIndex + MEMORIES_PER_PAGE,
  );
  const startItem = filteredCount > 0 ? startIndex + 1 : 0;
  const endItem = Math.min(startIndex + MEMORIES_PER_PAGE, filteredCount);
  const kindBrowseOptions: BrowseChipOption<typeof kindFilter>[] = [
    {
      count: Object.values(kindFacetCounts ?? {}).reduce(
        (sum, count) => sum + count,
        0,
      ),
      label: "All kinds",
      value: "all",
    },
    ...MEMORY_KIND_VALUES.map((value) => ({
      count: kindFacetCounts?.[value] ?? 0,
      label: value[0]?.toUpperCase() + value.slice(1),
      value,
    })),
  ];
  const scopeBrowseOptions: BrowseChipOption<typeof scopeFilter>[] = [
    {
      count:
        (scopeFacetCounts?.global ?? 0) + (scopeFacetCounts?.workspace ?? 0),
      label: "All scopes",
      value: "all",
    },
    { count: scopeFacetCounts?.global ?? 0, label: "Global", value: "global" },
    {
      count: scopeFacetCounts?.workspace ?? 0,
      label: "Workspace",
      value: "workspace",
    },
  ];

  const selectedProfile =
    MEMORY_EMBEDDING_PROFILES.find(
      (profile) => profile.id === form.watch("memoryProfileId"),
    ) ?? null;
  const memoryEnabled = form.watch("enabled") && hasEligibleMemoryProvider;
  const canSubmitSettings = hasEligibleMemoryProvider || !form.watch("enabled");
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
            <section className="border-separator/20 bg-surface rounded-2xl border p-5">
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
                  description={
                    hasEligibleMemoryProvider
                      ? "Allow Sentinel to retrieve and use long-term memory during chat."
                      : "Configure and enable a provider with a supported embedding profile before turning memory on."
                  }
                  label="Enable memory"
                  name="enabled"
                  switchProps={{
                    isDisabled: isBusy || !hasEligibleMemoryProvider,
                    size: "sm",
                  }}
                />

                <ControlledSwitchField
                  control={form.control}
                  description="Extract durable facts after successful assistant turns."
                  label="Automatic memory saving"
                  name="autoSaveEnabled"
                  switchProps={{
                    isDisabled: isBusy || !memoryEnabled,
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
                    hasEligibleMemoryProvider
                      ? "Embedding profiles come from your configured AI providers."
                      : "No supported embedding providers are active yet. Configure OpenAI in Settings > Providers."
                  }
                  label="Embedding profile"
                  name="memoryProfileId"
                  options={profileOptions}
                  selectProps={{
                    isDisabled: isBusy || !hasEligibleMemoryProvider,
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
                    isBusy || !form.formState.isDirty || !canSubmitSettings
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

          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Memory manager
                </h2>
                <p className="text-muted text-sm">
                  {filteredCount === totalMemories
                    ? `${totalMemories} stored mem${totalMemories === 1 ? "ory" : "ories"}`
                    : `${filteredCount} matching of ${totalMemories} stored memories`}
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">Search</span>
                <input
                  className="border-separator bg-background/70 text-foreground placeholder:text-muted/70 w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search memory content or summaries"
                  value={query}
                />
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">
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
                <span className="text-muted text-xs font-medium">Pinned</span>
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

            <div className="mb-4 grid gap-3">
              <MemoryBrowseChips
                label="Kind"
                onChange={setKindFilter}
                options={kindBrowseOptions}
                value={kindFilter}
              />
              <MemoryBrowseChips
                label="Scope"
                onChange={setScopeFilter}
                options={scopeBrowseOptions}
                value={scopeFilter}
              />
            </div>

            <div className="space-y-3">
              {memories.isPending && !memories.data ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton className="h-28 w-full rounded-xl" key={index} />
                ))
              ) : paginatedItems.length > 0 ? (
                paginatedItems.map((memory) => (
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
                            color={
                              memory.scope === "workspace"
                                ? "warning"
                                : "default"
                            }
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

                        <p className="text-foreground text-sm">
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
                          <span>Updated: {formatDate(memory.updatedAt)}</span>
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

            {filteredCount > MEMORIES_PER_PAGE && (
              <MemoryPagination
                page={safePage}
                totalPages={totalPages}
                startItem={startItem}
                endItem={endItem}
                filteredCount={filteredCount}
                onPageChange={setPage}
              />
            )}
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
                      ...(selectedProfile
                        ? { nextProfileId: selectedProfile.id }
                        : {}),
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

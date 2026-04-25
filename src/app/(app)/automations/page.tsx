"use client";

import { Button, Chip, Input, Skeleton } from "@heroui/react";
import {
  ArrowRight01Icon,
  PauseIcon,
  PlayIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { sileo } from "sileo";

import { NewAutomationModal } from "@/components/automations/new-automation-modal";
import {
  AUTOMATION_TEMPLATES,
  type AutomationTemplate,
} from "@/components/automations/automation-templates";
import { upsertAutomationInList } from "@/components/automations/automation-list-cache";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { SidebarToggle, useShell } from "@/components/shell";
import { api, type RouterOutputs } from "@/trpc/react";

type AutomationItem = RouterOutputs["automations"]["list"]["active"][number];

function matchesAutomation(
  automation: Pick<
    AutomationItem,
    "title" | "prompt" | "scheduleType" | "status"
  >,
  query: string,
) {
  if (!query.trim()) return true;
  const haystack =
    `${automation.title} ${automation.prompt} ${automation.scheduleType} ${automation.status}`.toLowerCase();
  return haystack.includes(query.toLowerCase().trim());
}

function formatSchedule(automation: AutomationItem) {
  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  switch (automation.scheduleType) {
    case "hourly":
      return "Hourly";
    case "daily":
      return `Daily at ${automation.scheduleTime ?? "09:00"}`;
    case "weekly":
      return `Weekly on ${weekdayNames[automation.scheduleDayOfWeek ?? 1]} at ${automation.scheduleTime ?? "09:00"}`;
    case "weekdays":
      return `Weekdays at ${automation.scheduleTime ?? "09:00"}`;
    case "custom":
      return automation.scheduleCron ?? "Custom";
    default:
      return "Unknown";
  }
}

function AutomationRow({
  automation,
  isToggling,
  onToggleStatus,
}: {
  automation: AutomationItem;
  isToggling: boolean;
  onToggleStatus: (id: string) => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl bg-surface/70 dark:bg-surface/50 px-3 py-2.5 transition-colors hover:bg-surface-hover/20">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3"
        href={`/automations/${encodeURIComponent(automation.id)}`}
        prefetch
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${
            automation.status === "active"
              ? "bg-success-soft/60 text-success dark:bg-success-soft/30"
              : "bg-background dark:bg-background"
          }`}
        >
          <HugeiconsIcon
            color="currentColor"
            icon={automation.status === "active" ? Rocket01Icon : PauseIcon}
            size={20}
            strokeWidth={1.5}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-[13px] font-semibold leading-tight line-clamp-1">
              {automation.title}
            </span>
            <Chip
              size="sm"
              className="bg-warning-soft text-warning-soft-foreground"
            >
              {automation.workspace?.name ?? "Current workspace"}
            </Chip>
          </div>
          <p className="text-muted mt-0.5 truncate text-xs leading-snug">
            {formatSchedule(automation)}
          </p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          isPending={isToggling}
          onPress={() => onToggleStatus(automation.id)}
          size="sm"
          variant="ghost"
          isIconOnly
          className="h-7 w-7 min-w-0"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={automation.status === "active" ? PauseIcon : PlayIcon}
            size={16}
            strokeWidth={1.5}
            className="text-muted transition-colors group-hover:text-foreground"
          />
        </Button>
        <Link
          href={`/automations/${encodeURIComponent(automation.id)}`}
          prefetch
        >
          <div className="text-muted transition-colors group-hover:text-foreground">
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={1.5}
            />
          </div>
        </Link>
      </div>
    </div>
  );
}

function AutomationsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          className="flex items-center gap-3 rounded-2xl bg-surface/70 dark:bg-surface/50 px-3 py-2.5"
          key={index}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-[14px]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-3 w-44 rounded-md" />
          </div>
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        </div>
      ))}
    </>
  );
}

export default function AutomationsPage() {
  const { leftSidebarOpen } = useShell();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [togglingSet, setTogglingSet] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<
    AutomationTemplate | undefined
  >();

  const automationsQuery = api.automations.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const toggleMutation = api.automations.toggleStatus.useMutation();

  const active = automationsQuery.data?.active ?? [];
  const paused = automationsQuery.data?.paused ?? [];

  const filteredActive = useMemo(
    () => active.filter((item) => matchesAutomation(item, query)),
    [active, query],
  );
  const filteredPaused = useMemo(
    () => paused.filter((item) => matchesAutomation(item, query)),
    [paused, query],
  );

  const handleOpenModal = useCallback((template?: AutomationTemplate) => {
    setActiveTemplate(template);
    setModalOpen(true);
  }, []);

  const handleToggleStatus = useCallback(
    async (id: string) => {
      const automation = [...active, ...paused].find((a) => a.id === id);
      setTogglingSet((prev) => new Set(prev).add(id));
      const previousList = utils.automations.list.getData();

      if (automation) {
        utils.automations.list.setData(undefined, (current) =>
          upsertAutomationInList(current, {
            ...automation,
            status: automation.status === "active" ? "paused" : "active",
          }),
        );
      }

      try {
        const updated = await toggleMutation.mutateAsync({ id });
        utils.automations.list.setData(undefined, (current) =>
          upsertAutomationInList(current, updated),
        );
        utils.automations.get.setData({ id }, (current) =>
          current ? { ...current, ...updated } : current,
        );
        void utils.automations.list.invalidate();
        void utils.automations.get.invalidate({ id });
      } catch (error) {
        utils.automations.list.setData(undefined, previousList);
        sileo.error({
          description:
            error instanceof Error
              ? error.message
              : "Failed to update automation status.",
        });
      } finally {
        setTogglingSet((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [active, paused, toggleMutation, utils],
  );

  return (
    <SettingsPageWrapper
      actions={
        <Button
          onPress={() => handleOpenModal()}
          size="sm"
          variant="primary"
          className="h-7 px-2"
        >
          New automation
        </Button>
      }
      title={
        <div>
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          Automations
        </div>
      }
    >
      {automationsQuery.error ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-2xl border px-3 py-2.5 text-xs">
          {automationsQuery.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search automations..."
            value={query}
            variant="secondary"
            fullWidth
          />
        </div>

        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-1.5">
            <div className="px-1.5 pb-0.5">
              <h2 className="text-foreground text-sm font-medium">Active</h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {automationsQuery.isPending && !automationsQuery.data ? (
                <AutomationsSkeleton />
              ) : filteredActive.length ? (
                filteredActive.map((automation) => (
                  <AutomationRow
                    automation={automation}
                    isToggling={togglingSet.has(automation.id)}
                    key={automation.id}
                    onToggleStatus={handleToggleStatus}
                  />
                ))
              ) : active.length ? (
                <div className="rounded-2xl bg-surface/70 dark:bg-surface/50 px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No matching automations
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Try a different search term.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-surface/70 dark:bg-surface/50 px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No active automations
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Create one, then toggle it to active when you are ready to
                    run it.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <div className="px-1.5 pb-0.5">
              <h2 className="text-foreground text-sm font-medium">Paused</h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {automationsQuery.isPending && !automationsQuery.data ? (
                <AutomationsSkeleton />
              ) : filteredPaused.length ? (
                filteredPaused.map((automation) => (
                  <AutomationRow
                    automation={automation}
                    isToggling={togglingSet.has(automation.id)}
                    key={automation.id}
                    onToggleStatus={handleToggleStatus}
                  />
                ))
              ) : paused.length ? (
                <div className="rounded-2xl bg-surface/70 dark:bg-surface/50 px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No matching automations
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Try a different search term.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-surface/70 dark:bg-surface/50 px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No paused automations
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Nothing paused right now. New automations start in paused
                    state.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <div className="px-1.5 pb-0.5">
              <h2 className="text-foreground text-sm font-medium">Templates</h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {AUTOMATION_TEMPLATES.map((template) => (
                <button
                  className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl bg-surface/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover/20 dark:bg-surface/50"
                  key={template.id}
                  onClick={() => handleOpenModal(template)}
                  type="button"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-background dark:bg-background">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={template.icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground text-[13px] font-semibold leading-tight">
                      {template.title}
                    </span>
                    <p className="text-muted mt-0.5 line-clamp-2 text-xs leading-snug">
                      {template.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <NewAutomationModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        template={activeTemplate}
      />
    </SettingsPageWrapper>
  );
}

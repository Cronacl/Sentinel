"use client";

import { Button, Chip, Input, Skeleton, Spinner } from "@heroui/react";
import {
  ArrowRight01Icon,
  PauseIcon,
  PlayIcon,
  PlusSignIcon,
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
  isRunningNow,
  isToggling,
  onRunNow,
  onToggleStatus,
}: {
  automation: AutomationItem;
  isRunningNow: boolean;
  isToggling: boolean;
  onRunNow: (id: string) => void;
  onToggleStatus: (id: string) => void;
}) {
  return (
    <div className="border-separator/20 bg-surface group flex items-center gap-2.5 rounded-2xl border p-2.5 transition-colors">
      <Link
        className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-80 transition-opacity"
        href={`/automations/${encodeURIComponent(automation.id)}`}
        prefetch
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
          <HugeiconsIcon
            color="currentColor"
            icon={automation.status === "active" ? Rocket01Icon : PauseIcon}
            size={16}
            strokeWidth={1.5}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">
              {automation.title}
            </span>
            <Chip
              size="sm"
              className="bg-warning-soft text-warning-soft-foreground"
            >
              {automation.workspace?.name ?? "Current workspace"}
            </Chip>
          </div>
          <p className="text-muted mt-0.5 truncate text-xs">
            {formatSchedule(automation)}
          </p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          isPending={isToggling}
          onPress={() => onToggleStatus(automation.id)}
          size="sm"
          variant="tertiary"
          isIconOnly
        >
          <HugeiconsIcon
            color="currentColor"
            icon={automation.status === "active" ? PauseIcon : PlayIcon}
            size={14}
            strokeWidth={1.5}
          />
        </Button>
        <Link
          href={`/automations/${encodeURIComponent(automation.id)}`}
          prefetch
        >
          <div className="text-muted transition-colors group-hover:text-muted">
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
    <div>
      <Skeleton className="w-full h-[4.5rem] opacity-50 shrink-0 rounded-2xl" />
    </div>
  );
}

export default function AutomationsPage() {
  const { leftSidebarOpen } = useShell();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [runningNowSet, setRunningNowSet] = useState<Set<string>>(new Set());
  const [togglingSet, setTogglingSet] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<
    AutomationTemplate | undefined
  >();

  const automationsQuery = api.automations.list.useQuery(undefined, {
    refetchInterval: 2_000,
  });
  const runNowMutation = api.automations.runNow.useMutation();
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

  const handleRunNow = useCallback(
    async (id: string) => {
      setRunningNowSet((prev) => new Set(prev).add(id));
      try {
        await runNowMutation.mutateAsync({ id });
        sileo.success({ description: "Automation triggered." });
      } catch (error) {
        sileo.error({
          description:
            error instanceof Error
              ? error.message
              : "Failed to run automation.",
        });
      } finally {
        setRunningNowSet((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [runNowMutation],
  );

  const handleToggleStatus = useCallback(
    async (id: string) => {
      const automation = [...active, ...paused].find((a) => a.id === id);
      const wasPaused = automation?.status !== "active";
      setTogglingSet((prev) => new Set(prev).add(id));
      try {
        await toggleMutation.mutateAsync({ id });
        await Promise.all([
          utils.automations.list.invalidate(),
          utils.automations.get.invalidate({ id }),
        ]);
        sileo.success({
          description: wasPaused ? "Automation resumed." : "Automation paused.",
        });
      } catch (error) {
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
          className="h-7 px-2 rounded-[10px]"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={PlusSignIcon}
            size={16}
            strokeWidth={1.5}
          />
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

      <div className="flex flex-col gap-5">
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search automations"
          value={query}
          variant="secondary"
        />

        <section>
          <h2 className="text-foreground mb-3 text-sm font-medium">Active</h2>
          <div className="grid grid-cols-1 gap-1 min-h-[4.5rem]">
            {automationsQuery.isPending && !automationsQuery.data ? (
              <AutomationsSkeleton />
            ) : filteredActive.length ? (
              filteredActive.map((automation) => (
                <AutomationRow
                  automation={automation}
                  isRunningNow={runningNowSet.has(automation.id)}
                  isToggling={togglingSet.has(automation.id)}
                  key={automation.id}
                  onRunNow={handleRunNow}
                  onToggleStatus={handleToggleStatus}
                />
              ))
            ) : active.length ? (
              <div className="border-separator/20 bg-surface rounded-2xl border p-4 col-span-full">
                <h2 className="text-foreground text-sm font-medium">
                  No matching automations
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Try a different search term.
                </p>
              </div>
            ) : (
              <div className="border-separator/20 bg-surface rounded-2xl border p-4 col-span-full">
                <h2 className="text-foreground text-sm font-medium">
                  No active automations
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Create one, then toggle it to active when you are ready to run
                  it.
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-sm font-medium">Paused</h2>
          <div className="grid grid-cols-1 gap-1 min-h-[4.5rem]">
            {automationsQuery.isPending && !automationsQuery.data ? (
              <AutomationsSkeleton />
            ) : filteredPaused.length ? (
              filteredPaused.map((automation) => (
                <AutomationRow
                  automation={automation}
                  isRunningNow={runningNowSet.has(automation.id)}
                  isToggling={togglingSet.has(automation.id)}
                  key={automation.id}
                  onRunNow={handleRunNow}
                  onToggleStatus={handleToggleStatus}
                />
              ))
            ) : paused.length ? (
              <div className="border-separator/20 bg-surface rounded-2xl border p-4 col-span-full">
                <h2 className="text-foreground text-sm font-medium">
                  No matching automations
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Try a different search term.
                </p>
              </div>
            ) : (
              <div className="border-separator/20 bg-surface rounded-2xl border p-4 col-span-full">
                <h2 className="text-foreground text-sm font-medium">
                  No paused automations
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Nothing paused right now. New automations start in paused
                  state.
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-sm font-medium">
            Templates
          </h2>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {AUTOMATION_TEMPLATES.map((template) => (
              <button
                className="border-separator/20 cursor-pointer bg-surface hover:bg-surface-hover group flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors"
                key={template.id}
                onClick={() => handleOpenModal(template)}
                type="button"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={template.icon}
                    size={16}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-foreground text-sm font-medium">
                    {template.title}
                  </span>
                  <p className="text-muted mt-0.5 line-clamp-2 text-xs">
                    {template.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {runNowMutation.isPending && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Spinner color="current" size="sm" />
          Triggering automation...
        </div>
      )}

      <NewAutomationModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        template={activeTemplate}
      />
    </SettingsPageWrapper>
  );
}

"use client";

import {
  AlertDialog,
  Button,
  Chip,
  Description,
  Form,
  Label,
  Skeleton,
  Spinner,
  TimeField,
} from "@heroui/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  PlayIcon,
  PauseIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Time } from "@internationalized/date";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
  type SelectOption,
} from "@/components/forms/controlled-fields";
import { SidebarToggle, useShell } from "@/components/shell";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  AUTOMATION_SCHEDULE_TYPES,
  CHAT_ENGINES,
  type ChatEngine,
} from "@/server/db/enums";
import {
  getAvailableAutomationModels,
  getAutomationEngineOptions,
  getAutomationModelOptions,
  getAutomationModelsForEngine,
  getAutomationReasoningOptions,
  resolveAutomationSelection,
} from "@/components/automations/automation-form-helpers";
import { isLikelyCronExpression } from "@/schemas/automation.schema";
import { sileo } from "sileo";
import { api } from "@/trpc/react";

function parseTimeString(value: string | null | undefined): Time | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return new Time(Number(match[1]), Number(match[2]));
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatRelative(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

function formatSchedule(automation: {
  scheduleType: "hourly" | "daily" | "weekly" | "weekdays" | "custom";
  scheduleTime: string | null;
  scheduleDayOfWeek: number | null;
  scheduleCron: string | null;
}) {
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

const editFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required.")
      .max(200, "Title must be 200 characters or fewer."),
    prompt: z.string().trim().min(1, "Prompt is required."),
    workspaceId: z.string().trim().min(1, "Workspace is required."),
    scheduleType: z.enum(AUTOMATION_SCHEDULE_TYPES),
    scheduleDayOfWeek: z.string(),
    scheduleTime: z.string(),
    scheduleCron: z.string(),
    chatEngine: z.enum(CHAT_ENGINES),
    modelId: z.string().trim().min(1, "Model is required."),
    reasoningEffort: z.string(),
  })
  .superRefine((data, ctx) => {
    const needsTime =
      data.scheduleType === "daily" ||
      data.scheduleType === "weekly" ||
      data.scheduleType === "weekdays";

    if (needsTime && !data.scheduleTime.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Time is required for this schedule.",
        path: ["scheduleTime"],
      });
    }

    if (data.scheduleType === "weekly" && !data.scheduleDayOfWeek.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Day is required for a weekly schedule.",
        path: ["scheduleDayOfWeek"],
      });
    }

    if (data.scheduleType === "custom" && !data.scheduleCron.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cron expression is required.",
        path: ["scheduleCron"],
      });
      return;
    }

    if (
      data.scheduleType === "custom" &&
      !isLikelyCronExpression(data.scheduleCron)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cron expression must use a macro like @hourly or 5-6 fields.",
        path: ["scheduleCron"],
      });
    }
  });

type EditFormValues = z.infer<typeof editFormSchema>;

const SCHEDULE_OPTIONS: readonly SelectOption[] = [
  { description: "Run once every hour.", label: "Hourly", value: "hourly" },
  {
    description: "Run every day at a specific time.",
    label: "Daily",
    value: "daily",
  },
  {
    description: "Run once a week on a specific day and time.",
    label: "Weekly",
    value: "weekly",
  },
  {
    description: "Run Monday through Friday at a specific time.",
    label: "Weekdays",
    value: "weekdays",
  },
  {
    description: "Use a custom cron expression.",
    label: "Custom",
    value: "custom",
  },
];

const DAY_OPTIONS: readonly SelectOption[] = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="mt-3 h-28 w-full rounded-xl" />
      </div>
      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-5 w-32 rounded-md" />
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-16 w-full rounded-xl" key={index} />
          ))}
        </div>
      </div>
      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-5 w-32 rounded-md" />
        <div className="mt-3 space-y-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-12 w-full rounded-xl" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AutomationDetailScreen({
  automationId,
}: {
  automationId: string;
}) {
  const router = useRouter();
  const { leftSidebarOpen } = useShell();
  const utils = api.useUtils();

  const automationQuery = api.automations.get.useQuery(
    { id: automationId },
    { refetchInterval: 2_000 },
  );
  const runNowMutation = api.automations.runNow.useMutation();
  const toggleMutation = api.automations.toggleStatus.useMutation();
  const deleteMutation = api.automations.delete.useMutation();
  const updateMutation = api.automations.update.useMutation();

  const workspacesQuery = api.workspaces.list.useQuery();
  const enginesQuery = api.engines.list.useQuery();
  const sentinelModelsQuery = api.engines.models.useQuery({
    engine: "sentinel",
  });
  const codexModelsQuery = api.engines.models.useQuery({
    engine: "codex",
  });
  const claudeModelsQuery = api.engines.models.useQuery({
    engine: "claude",
  });
  const copilotModelsQuery = api.engines.models.useQuery({
    engine: "copilot",
  });
  const cursorModelsQuery = api.engines.models.useQuery({
    engine: "cursor",
  });
  const openCodeModelsQuery = api.engines.models.useQuery({
    engine: "opencode",
  });

  const automation = automationQuery.data ?? null;
  const statusTone = automation?.status === "active" ? "success" : "warning";

  const [submitError, setSubmitError] = useState("");

  const availableSentinelModels = useMemo(
    () => getAvailableAutomationModels(sentinelModelsQuery.data ?? []),
    [sentinelModelsQuery.data],
  );
  const availableCodexModels = useMemo(
    () => getAvailableAutomationModels(codexModelsQuery.data ?? []),
    [codexModelsQuery.data],
  );
  const availableClaudeModels = useMemo(
    () => getAvailableAutomationModels(claudeModelsQuery.data ?? []),
    [claudeModelsQuery.data],
  );
  const availableCopilotModels = useMemo(
    () => getAvailableAutomationModels(copilotModelsQuery.data ?? []),
    [copilotModelsQuery.data],
  );
  const availableCursorModels = useMemo(
    () => getAvailableAutomationModels(cursorModelsQuery.data ?? []),
    [cursorModelsQuery.data],
  );
  const availableOpenCodeModels = useMemo(
    () => getAvailableAutomationModels(openCodeModelsQuery.data ?? []),
    [openCodeModelsQuery.data],
  );

  const formDefaults = useMemo<EditFormValues | null>(() => {
    if (!automation) return null;
    const engine = (automation.chatEngine ?? "sentinel") as ChatEngine;
    const selection = resolveAutomationSelection(
      getAutomationModelsForEngine(engine, {
        claude: availableClaudeModels,
        copilot: availableCopilotModels,
        codex: availableCodexModels,
        cursor: availableCursorModels,
        opencode: availableOpenCodeModels,
        sentinel: availableSentinelModels,
      }),
      automation.modelId ?? null,
      (automation.reasoningEffort as ReasoningEffort | null) ?? null,
    );

    return {
      title: automation.title,
      prompt: automation.prompt,
      chatEngine: engine,
      workspaceId: automation.workspaceId ?? "__current__",
      scheduleType: automation.scheduleType,
      scheduleDayOfWeek: String(automation.scheduleDayOfWeek ?? 1),
      scheduleTime: automation.scheduleTime ?? "09:00",
      scheduleCron: automation.scheduleCron ?? "",
      modelId: automation.modelId ?? selection.modelId,
      reasoningEffort:
        (automation.reasoningEffort as ReasoningEffort | null) ??
        selection.reasoningEffort ??
        "",
    };
  }, [
    automation,
    availableClaudeModels,
    availableCopilotModels,
    availableCodexModels,
    availableCursorModels,
    availableOpenCodeModels,
    availableSentinelModels,
  ]);

  const form = useForm<EditFormValues>({
    defaultValues: formDefaults ?? undefined,
    resolver: zodResolver(editFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const hydratedAutomationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!automation || !formDefaults) {
      hydratedAutomationIdRef.current = null;
      return;
    }

    if (hydratedAutomationIdRef.current !== automation.id) {
      hydratedAutomationIdRef.current = automation.id;
      form.reset(formDefaults);
      return;
    }

    if (form.formState.isDirty) return;
    form.reset(formDefaults);
  }, [automation, form, formDefaults, form.formState.isDirty]);

  const scheduleType = form.watch("scheduleType");
  const selectedEngine = form.watch("chatEngine");
  const selectedModelKey = form.watch("modelId");

  const workspaceOptions = useMemo(() => {
    const workspaces = workspacesQuery.data ?? [];
    return [
      {
        description: "Use the currently selected workspace.",
        label: "Current workspace",
        value: "__current__",
      },
      ...workspaces.map((ws) => ({
        description: ws.rootPath ?? "No root path configured",
        label: ws.name,
        value: ws.id,
      })),
    ];
  }, [workspacesQuery.data]);

  const engineOptions = useMemo(
    () => getAutomationEngineOptions(enginesQuery.data ?? []),
    [enginesQuery.data],
  );
  const availableModels = useMemo(
    () =>
      getAutomationModelsForEngine(selectedEngine, {
        claude: availableClaudeModels,
        copilot: availableCopilotModels,
        codex: availableCodexModels,
        cursor: availableCursorModels,
        opencode: availableOpenCodeModels,
        sentinel: availableSentinelModels,
      }),
    [
      availableClaudeModels,
      availableCopilotModels,
      availableCodexModels,
      availableCursorModels,
      availableOpenCodeModels,
      availableSentinelModels,
      selectedEngine,
    ],
  );
  const modelOptions = useMemo(() => {
    return getAutomationModelOptions(availableModels, selectedModelKey);
  }, [availableModels, selectedModelKey]);

  const selectedModel = useMemo(() => {
    if (!selectedModelKey || selectedModelKey === "__default__") return null;
    return (
      availableModels.find((model) => model.modelId === selectedModelKey) ??
      null
    );
  }, [availableModels, selectedModelKey]);

  const supportedReasoningEfforts = useMemo(() => {
    if (!selectedModel) return [];
    return selectedModel.supportedReasoningEfforts;
  }, [selectedModel]);

  const reasoningOptions = useMemo(
    () => getAutomationReasoningOptions(supportedReasoningEfforts),
    [supportedReasoningEfforts],
  );

  useEffect(() => {
    const currentModelKey = form.getValues("modelId");
    if (!currentModelKey || currentModelKey === "__default__") {
      return;
    }

    const modelStillSelectable = modelOptions.some(
      (option) => option.value === currentModelKey,
    );
    if (modelStillSelectable) {
      return;
    }

    const nextSelection = resolveAutomationSelection(
      availableModels,
      null,
      null,
    );
    form.setValue("modelId", nextSelection.modelId);
    form.setValue("reasoningEffort", nextSelection.reasoningEffort ?? "");
  }, [availableModels, form, modelOptions]);

  useEffect(() => {
    if (!selectedModelKey || selectedModelKey === "__default__") {
      if (form.getValues("reasoningEffort")) {
        form.setValue("reasoningEffort", "");
      }
      return;
    }

    if (!selectedModel) {
      return;
    }

    const currentEffort = form.getValues("reasoningEffort");
    const nextReasoningEffort = resolveAutomationSelection(
      [selectedModel],
      selectedModel.modelId,
      (currentEffort as ReasoningEffort | null) ?? null,
    ).reasoningEffort;

    if ((currentEffort || "") === (nextReasoningEffort ?? "")) {
      return;
    }

    form.setValue("reasoningEffort", nextReasoningEffort ?? "");
  }, [form, selectedModel, selectedModelKey]);

  const handleSave = useCallback(
    async (values: EditFormValues) => {
      if (!automation) return;
      setSubmitError("");

      try {
        const scheduleTime =
          values.scheduleType === "daily" ||
          values.scheduleType === "weekly" ||
          values.scheduleType === "weekdays"
            ? values.scheduleTime
            : null;
        const scheduleCron =
          values.scheduleType === "custom" ? values.scheduleCron : null;
        const scheduleDayOfWeek =
          values.scheduleType === "weekly"
            ? Number.parseInt(values.scheduleDayOfWeek, 10)
            : null;

        const selectedReasoning =
          values.reasoningEffort.trim().length > 0
            ? (values.reasoningEffort as ReasoningEffort)
            : null;

        await updateMutation.mutateAsync({
          id: automation.id,
          title: values.title,
          prompt: values.prompt,
          chatEngine: values.chatEngine,
          workspaceId:
            values.workspaceId === "__current__" ? null : values.workspaceId,
          scheduleType: values.scheduleType,
          scheduleDayOfWeek,
          scheduleTime,
          scheduleCron,
          modelId: values.modelId === "__default__" ? null : values.modelId,
          reasoningEffort: selectedReasoning,
        });

        await Promise.all([
          automationQuery.refetch(),
          utils.automations.list.invalidate(),
        ]);
        form.reset(values);
        sileo.success({ description: "Automation updated." });
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Unable to save automation.",
        );
      }
    },
    [automation, updateMutation, automationQuery, utils, form],
  );

  const handleRunNow = async () => {
    if (!automation) return;
    try {
      await runNowMutation.mutateAsync({ id: automation.id });
      await automationQuery.refetch();
      sileo.success({ description: "Automation triggered." });
    } catch (error) {
      sileo.error({
        description:
          error instanceof Error ? error.message : "Failed to run automation.",
      });
    }
  };

  const handleToggleStatus = async () => {
    if (!automation) return;
    const wasActive = automation.status === "active";
    try {
      await toggleMutation.mutateAsync({ id: automation.id });
      await Promise.all([
        automationQuery.refetch(),
        utils.automations.list.invalidate(),
        utils.automations.get.invalidate({ id: automation.id }),
      ]);
      sileo.success({
        description: wasActive ? "Automation paused." : "Automation resumed.",
      });
    } catch (error) {
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update automation status.",
      });
    }
  };

  const handleDelete = async () => {
    if (!automation) return;
    try {
      await deleteMutation.mutateAsync({ id: automation.id });
      await utils.automations.list.invalidate();
      sileo.success({ description: "Automation deleted." });
      router.push("/automations");
    } catch (error) {
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete automation.",
      });
    }
  };

  const isActive = automation?.status === "active";

  const isDirty = form.formState.isDirty;
  const isSaving = form.formState.isSubmitting || updateMutation.isPending;

  const visibleRuns = useMemo(
    () => (automation?.runs ?? []).filter((r) => !r.thread?.archivedAt),
    [automation?.runs],
  );

  return (
    <SettingsPageWrapper
      actions={
        <div className="flex items-center gap-1.5">
          <AlertDialog>
            <Button
              isPending={runNowMutation.isPending}
              size="sm"
              variant="primary"
              className="h-7 px-2"
            >
              Run now
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[400px]">
                  {(renderProps) => (
                    <>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status="accent" />
                        <AlertDialog.Heading>
                          Run this automation now?
                        </AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body>
                        <p>
                          This will immediately trigger a run of the automation
                          outside of its normal schedule.
                        </p>
                      </AlertDialog.Body>
                      <AlertDialog.Footer>
                        <Button
                          variant="tertiary"
                          onPress={() => renderProps.close()}
                        >
                          Cancel
                        </Button>
                        <Button
                          onPress={() => {
                            renderProps.close();
                            void handleRunNow();
                          }}
                        >
                          Run now
                        </Button>
                      </AlertDialog.Footer>
                    </>
                  )}
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>

          <AlertDialog>
            <Button
              isPending={toggleMutation.isPending}
              size="sm"
              className="h-7 px-2 bg-warning-soft text-warning-soft-foreground"
            >
              {isActive ? "Pause" : "Resume"}
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[400px]">
                  {(renderProps) => (
                    <>
                      <AlertDialog.Header>
                        <AlertDialog.Icon
                          status={isActive ? "warning" : "success"}
                        />
                        <AlertDialog.Heading>
                          {isActive
                            ? "Pause this automation?"
                            : "Resume this automation?"}
                        </AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body>
                        <p>
                          {isActive
                            ? "The automation will stop running on its schedule until you resume it."
                            : "The automation will start running again on its configured schedule."}
                        </p>
                      </AlertDialog.Body>
                      <AlertDialog.Footer>
                        <Button
                          variant="tertiary"
                          onPress={() => renderProps.close()}
                        >
                          Cancel
                        </Button>
                        <Button
                          onPress={() => {
                            renderProps.close();
                            void handleToggleStatus();
                          }}
                        >
                          {isActive ? "Pause" : "Resume"}
                        </Button>
                      </AlertDialog.Footer>
                    </>
                  )}
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>

          <AlertDialog>
            <Button
              isPending={deleteMutation.isPending}
              size="sm"
              variant="tertiary"
              className="h-7 px-2 text-danger-soft-foreground bg-danger-soft"
              isIconOnly
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Delete02Icon}
                size={14}
                strokeWidth={1.5}
              />
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[400px]">
                  {(renderProps) => (
                    <>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status="danger" />
                        <AlertDialog.Heading>
                          Delete this automation?
                        </AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body>
                        <p>
                          This will permanently delete the automation and all of
                          its run history. This action cannot be undone.
                        </p>
                      </AlertDialog.Body>
                      <AlertDialog.Footer>
                        <Button
                          variant="tertiary"
                          onPress={() => renderProps.close()}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          onPress={() => {
                            renderProps.close();
                            void handleDelete();
                          }}
                        >
                          Delete
                        </Button>
                      </AlertDialog.Footer>
                    </>
                  )}
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        </div>
      }
      title={
        <div className="flex items-center gap-2">
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          <Link
            href="/automations"
            className="text-muted hover:text-foreground transition-colors"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={20}
              strokeWidth={1.5}
            />
          </Link>
          {automation?.title ?? "Automation details"}
        </div>
      }
    >
      {automationQuery.error ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-2xl border px-3 py-2.5 text-xs">
          {automationQuery.error.message}
        </p>
      ) : null}

      {automationQuery.isPending && !automation ? (
        <DetailSkeleton />
      ) : !automation ? (
        <div className="border-separator/20 bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground text-sm font-medium">
            Automation not found
          </h2>
          <p className="text-muted mt-1 text-sm">
            This automation is no longer available.
          </p>
        </div>
      ) : (
        <Form
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(handleSave)}
        >
          {submitError ? (
            <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground rounded-2xl border px-3 py-2.5 text-xs">
              {submitError}
            </p>
          ) : null}

          {/* Status banner */}
          <div className="border-separator/20 bg-surface flex items-center gap-2.5 rounded-2xl border p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
              <HugeiconsIcon
                color="currentColor"
                icon={isActive ? Rocket01Icon : PauseIcon}
                size={16}
                strokeWidth={1.5}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Chip color={statusTone} size="sm" variant="soft">
                  {isActive ? "Active" : "Paused"}
                </Chip>
                <span className="text-muted text-xs truncate">
                  {formatSchedule(automation)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span
                  className="text-muted text-xs"
                  title={formatDateTime(automation.nextRunAt)}
                >
                  Next run {formatRelative(automation.nextRunAt)}
                </span>
                {automation.lastRanAt ? (
                  <span
                    className="text-muted text-xs"
                    title={formatDateTime(automation.lastRanAt)}
                  >
                    Last ran {formatRelative(automation.lastRanAt)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Automation fields */}
          <section>
            <h2 className="text-foreground mb-3 px-2 text-sm font-medium">
              Automation
            </h2>
            <div className="border-separator/20 bg-surface rounded-2xl border p-4">
              <div className="flex flex-col gap-5">
                <ControlledTextField
                  control={form.control}
                  description="Visible name used in the automations list and run history."
                  inputProps={{ placeholder: "Performance audit" }}
                  label="Title"
                  name="title"
                  textFieldProps={{ isRequired: true }}
                />

                <ControlledTextAreaField
                  control={form.control}
                  description="Main prompt the automation sends when it runs."
                  label="Prompt"
                  name="prompt"
                  textAreaProps={{
                    placeholder:
                      "Audit performance regressions and propose fixes.",
                    rows: 5,
                  }}
                  textFieldProps={{ isRequired: true }}
                />
              </div>
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h2 className="text-foreground mb-3 px-2 text-sm font-medium">
              Schedule
            </h2>
            <div className="border-separator/20 bg-surface rounded-2xl border p-4">
              <div className="flex flex-col gap-5">
                <ControlledSelectField
                  control={form.control}
                  description="How often this automation should run."
                  label="Frequency"
                  name="scheduleType"
                  options={SCHEDULE_OPTIONS}
                />

                {scheduleType === "weekly" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ControlledSelectField
                      control={form.control}
                      description="Day of week to execute."
                      label="Day"
                      name="scheduleDayOfWeek"
                      options={DAY_OPTIONS}
                    />
                    <Controller
                      control={form.control}
                      name="scheduleTime"
                      render={({ field }) => (
                        <TimeField
                          hourCycle={24}
                          granularity="minute"
                          value={parseTimeString(field.value)}
                          onChange={(val) =>
                            field.onChange(
                              val
                                ? `${String(val.hour).padStart(2, "0")}:${String(val.minute).padStart(2, "0")}`
                                : "",
                            )
                          }
                        >
                          <Label>Time</Label>
                          <TimeField.Group>
                            <TimeField.Input>
                              {(segment) => (
                                <TimeField.Segment segment={segment} />
                              )}
                            </TimeField.Input>
                          </TimeField.Group>
                          <Description>24-hour format.</Description>
                        </TimeField>
                      )}
                    />
                  </div>
                ) : null}

                {(scheduleType === "daily" || scheduleType === "weekdays") && (
                  <Controller
                    control={form.control}
                    name="scheduleTime"
                    render={({ field }) => (
                      <TimeField
                        hourCycle={24}
                        granularity="minute"
                        value={parseTimeString(field.value)}
                        onChange={(val) =>
                          field.onChange(
                            val
                              ? `${String(val.hour).padStart(2, "0")}:${String(val.minute).padStart(2, "0")}`
                              : "",
                          )
                        }
                      >
                        <Label>Time</Label>
                        <TimeField.Group>
                          <TimeField.Input>
                            {(segment) => (
                              <TimeField.Segment segment={segment} />
                            )}
                          </TimeField.Input>
                        </TimeField.Group>
                        <Description>24-hour format.</Description>
                      </TimeField>
                    )}
                  />
                )}

                {scheduleType === "custom" ? (
                  <ControlledTextField
                    control={form.control}
                    description="Cronbake cron expression."
                    inputProps={{ placeholder: "0 0 9 * * *" }}
                    label="Cron expression"
                    name="scheduleCron"
                  />
                ) : null}
              </div>
            </div>
          </section>

          {/* Configuration */}
          <section>
            <h2 className="text-foreground mb-3 px-2 text-sm font-medium">
              Configuration
            </h2>
            <div className="border-separator/20 bg-surface rounded-2xl border p-4">
              <div className="flex flex-col gap-5">
                <ControlledSelectField
                  control={form.control}
                  description="Workspace where this automation should run."
                  label="Project"
                  name="workspaceId"
                  options={workspaceOptions}
                />

                <ControlledSelectField
                  control={form.control}
                  description="Choose which engine and runtime this automation should use."
                  label="Engine"
                  name="chatEngine"
                  options={engineOptions}
                />

                <ControlledSelectField
                  control={form.control}
                  description="Model used when this automation runs."
                  label="Model"
                  name="modelId"
                  options={modelOptions}
                />

                <ControlledSelectField
                  control={form.control}
                  description="Reasoning effort applied to generated responses."
                  label="Reasoning"
                  name="reasoningEffort"
                  options={reasoningOptions}
                  selectProps={{
                    isDisabled: reasoningOptions.length === 0,
                  }}
                />
              </div>
            </div>
          </section>

          {/* Save / Discard */}
          <div className="flex items-center justify-end gap-1.5">
            <Button
              isDisabled={!isDirty || isSaving}
              onPress={() => form.reset(formDefaults ?? undefined)}
              size="sm"
              type="button"
              variant="tertiary"
              className="h-7 px-2"
            >
              Discard
            </Button>
            <Button
              isDisabled={!isDirty}
              isPending={isSaving}
              size="sm"
              type="submit"
              variant="primary"
              className="h-7 px-2"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Save changes
                </>
              )}
            </Button>
          </div>

          {/* Previous runs */}
          <section>
            <h2 className="text-foreground mb-3 px-2 text-sm font-medium">
              Previous runs
            </h2>
            <div className="grid grid-cols-1 gap-1">
              {visibleRuns.length ? (
                visibleRuns.map((run) => (
                  <div
                    className="border-separator/20 bg-surface group flex items-center gap-2.5 rounded-2xl border p-2.5 transition-colors"
                    key={run.id}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
                      {run.status === "running" || run.status === "pending" ? (
                        <Spinner color="current" size="sm" className="size-4" />
                      ) : (
                        <HugeiconsIcon
                          color="currentColor"
                          icon={
                            run.status === "completed"
                              ? Rocket01Icon
                              : PauseIcon
                          }
                          size={16}
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Chip
                          color={
                            run.status === "completed"
                              ? "success"
                              : run.status === "failed"
                                ? "danger"
                                : "default"
                          }
                          size="sm"
                          variant="soft"
                        >
                          {run.status}
                        </Chip>
                        {run.status === "running" && (
                          <span className="animate-pulse text-xs text-foreground/50">
                            running...
                          </span>
                        )}
                      </div>
                      <p className="text-muted mt-0.5 truncate text-xs">
                        {formatDateTime(run.startedAt)}
                        {run.error ? (
                          <span className="ml-2 text-danger-soft-foreground">
                            {run.error}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {run.thread?.id ? (
                        <Link href={`/thread/${run.thread.id}`} prefetch>
                          <div className="text-muted transition-colors group-hover:text-foreground">
                            <HugeiconsIcon
                              color="currentColor"
                              icon={ArrowRight01Icon}
                              size={16}
                              strokeWidth={1.5}
                            />
                          </div>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="border-separator/20 bg-surface rounded-2xl border p-4">
                  <h2 className="text-foreground text-sm font-medium">
                    No runs yet
                  </h2>
                  <p className="text-muted mt-1 text-sm">
                    Runs will appear here once the automation has been
                    triggered.
                  </p>
                </div>
              )}
            </div>
          </section>
        </Form>
      )}
    </SettingsPageWrapper>
  );
}

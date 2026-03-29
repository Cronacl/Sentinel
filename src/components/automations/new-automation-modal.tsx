"use client";

import {
  Button,
  Description,
  Form,
  Label,
  Modal,
  Spinner,
  TimeField,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Time } from "@internationalized/date";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { getErrorMessage } from "@/lib/errors";
import { sileo } from "sileo";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  AUTOMATION_SCHEDULE_TYPES,
  CHAT_ENGINES,
  type ChatEngine,
} from "@/server/db/enums";
import type { AutomationTemplate } from "@/components/automations/automation-templates";
import {
  getAvailableAutomationModels,
  getAutomationEngineOptions,
  getAutomationModelOptions,
  getAutomationModelsForEngine,
  getAutomationReasoningOptions,
  resolveAutomationSelection,
} from "@/components/automations/automation-form-helpers";
import {
  createAutomationSchema,
  type CreateAutomationInput,
  isLikelyCronExpression,
} from "@/schemas/automation.schema";
import { api } from "@/trpc/react";

const automationFormSchema = z
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

type AutomationFormValues = z.infer<typeof automationFormSchema>;

const SCHEDULE_OPTIONS = [
  {
    description: "Run once every hour.",
    label: "Hourly",
    value: "hourly",
  },
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
] as const;

const DAY_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
] as const;

function createDefaultValues(
  template?: AutomationTemplate,
  globalDefaults?: {
    chatEngine?: ChatEngine | null;
    modelId?: string | null;
    reasoningEffort?: ReasoningEffort | null;
  },
): AutomationFormValues {
  const defaultChatEngine = globalDefaults?.chatEngine ?? "sentinel";
  const defaultModelId =
    globalDefaults?.modelId ?? template?.defaults.modelId ?? "__default__";
  const defaultReasoningEffort = globalDefaults?.reasoningEffort ?? "";

  if (template) {
    return {
      title: template.defaults.title,
      prompt: template.defaults.prompt,
      workspaceId: "__current__",
      scheduleType: template.defaults.scheduleType,
      scheduleDayOfWeek: String(template.defaults.scheduleDayOfWeek ?? 1),
      scheduleTime: template.defaults.scheduleTime ?? "09:00",
      scheduleCron: template.defaults.scheduleCron ?? "",
      chatEngine: defaultChatEngine,
      modelId: defaultModelId,
      reasoningEffort: defaultReasoningEffort,
    };
  }

  return {
    title: "",
    prompt: "",
    workspaceId: "__current__",
    scheduleType: "daily",
    scheduleDayOfWeek: "1",
    scheduleTime: "09:00",
    scheduleCron: "",
    chatEngine: defaultChatEngine,
    modelId: defaultModelId,
    reasoningEffort: defaultReasoningEffort,
  };
}

function normalizeCreateInput(
  values: AutomationFormValues,
): CreateAutomationInput {
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

  return {
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
  };
}

function parseTimeString(value: string | null | undefined): Time | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return new Time(Number(match[1]), Number(match[2]));
}

interface NewAutomationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  template?: AutomationTemplate;
}

export function NewAutomationModal({
  isOpen,
  onOpenChange,
  template,
}: NewAutomationModalProps) {
  const router = useRouter();
  const state = useOverlayState({ isOpen, onOpenChange });
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const workspacesQuery = api.workspaces.list.useQuery(undefined, {
    enabled: isOpen,
  });
  const enginesQuery = api.engines.list.useQuery(undefined, {
    enabled: isOpen,
  });
  const sentinelModelsQuery = api.engines.models.useQuery(
    {
      engine: "sentinel",
    },
    { enabled: isOpen },
  );
  const codexModelsQuery = api.engines.models.useQuery(
    {
      engine: "codex",
    },
    { enabled: isOpen },
  );
  const claudeModelsQuery = api.engines.models.useQuery(
    {
      engine: "claude",
    },
    { enabled: isOpen },
  );
  const chatPreferencesQuery = api.chatPreferences.get.useQuery(undefined, {
    enabled: isOpen,
  });
  const createMutation = api.automations.create.useMutation();

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
  const globalDefaults = useMemo(() => {
    const preferredEngine = chatPreferencesQuery.data?.engine ?? "sentinel";
    const preferredReasoningEffort =
      (chatPreferencesQuery.data?.reasoningEffort as ReasoningEffort | null) ??
      null;
    const preferredModelId = chatPreferencesQuery.data?.modelId ?? null;

    const preferredModels = getAutomationModelsForEngine(preferredEngine, {
      claude: availableClaudeModels,
      codex: availableCodexModels,
      sentinel: availableSentinelModels,
    });

    const fallbackEngine: ChatEngine = "sentinel";
    const engine =
      preferredModels.length > 0 || preferredEngine === fallbackEngine
        ? preferredEngine
        : fallbackEngine;
    const models = getAutomationModelsForEngine(engine, {
      claude: availableClaudeModels,
      codex: availableCodexModels,
      sentinel: availableSentinelModels,
    });
    const selection = resolveAutomationSelection(
      models,
      engine === preferredEngine ? preferredModelId : null,
      preferredReasoningEffort,
    );

    return {
      chatEngine: engine,
      modelId: selection.modelId,
      reasoningEffort: selection.reasoningEffort,
    };
  }, [
    availableClaudeModels,
    availableCodexModels,
    availableSentinelModels,
    chatPreferencesQuery.data?.engine,
    chatPreferencesQuery.data?.modelId,
    chatPreferencesQuery.data?.reasoningEffort,
  ]);
  const initialValues = useMemo(
    () =>
      createDefaultValues(template, {
        chatEngine: globalDefaults.chatEngine,
        modelId: globalDefaults.modelId,
        reasoningEffort: globalDefaults.reasoningEffort,
      }),
    [
      globalDefaults.chatEngine,
      globalDefaults.modelId,
      globalDefaults.reasoningEffort,
      template,
    ],
  );

  const form = useForm<AutomationFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(automationFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const scheduleType = form.watch("scheduleType");
  const selectedEngine = form.watch("chatEngine");
  const selectedModelKey = form.watch("modelId");

  useEffect(() => {
    if (!isOpen) {
      setSubmitError("");
      form.reset(initialValues);
      return;
    }

    setSubmitError("");
    if (chatPreferencesQuery.isPending && !chatPreferencesQuery.data) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [
    chatPreferencesQuery.data,
    chatPreferencesQuery.isPending,
    form,
    form.formState.isDirty,
    initialValues,
    isOpen,
  ]);

  const workspaceOptions = useMemo(() => {
    const workspaces = workspacesQuery.data ?? [];
    return [
      {
        description: "Use the currently selected workspace.",
        label: "Current workspace",
        value: "__current__",
      },
      ...workspaces.map((workspace) => ({
        description: workspace.rootPath ?? "No root path configured",
        label: workspace.name,
        value: workspace.id,
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
        codex: availableCodexModels,
        sentinel: availableSentinelModels,
      }),
    [
      availableClaudeModels,
      availableCodexModels,
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

  const isBusy =
    form.formState.isSubmitting ||
    createMutation.isPending ||
    chatPreferencesQuery.isPending ||
    workspacesQuery.isLoading ||
    enginesQuery.isLoading ||
    sentinelModelsQuery.isLoading ||
    codexModelsQuery.isLoading ||
    claudeModelsQuery.isLoading;

  const handleCreate = async (values: AutomationFormValues) => {
    setSubmitError("");

    try {
      const input = normalizeCreateInput(values);
      const validated = createAutomationSchema.safeParse(input);
      if (!validated.success) {
        setSubmitError(
          validated.error.issues[0]?.message ?? "Invalid automation.",
        );
        return;
      }

      const created = await createMutation.mutateAsync(validated.data);
      await utils.automations.list.invalidate();
      sileo.success({ description: "Automation created." });
      state.close();
      router.push(`/automations/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Unable to create automation."));
    }
  };

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="border-separator w-full border sm:max-w-[520px]">
            <Form
              className="contents"
              onSubmit={form.handleSubmit(handleCreate)}
            >
              <Modal.Header className="items-start justify-between gap-4">
                <div>
                  <Modal.Heading className="text-base">
                    {template ? template.title : "New automation"}
                  </Modal.Heading>
                  <p className="text-muted mt-1 text-sm">
                    {template
                      ? template.description
                      : "Configure a recurring prompt that runs on your selected schedule."}
                  </p>
                </div>
                <Modal.CloseTrigger />
              </Modal.Header>

              <Modal.Body className="p-2">
                <div className="flex flex-col gap-5">
                  {submitError ? (
                    <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                      {submitError}
                    </p>
                  ) : null}

                  <ControlledTextField
                    control={form.control}
                    description="Visible name used in the automations list and run history."
                    inputProps={{ placeholder: "Performance audit" }}
                    label="Automation title"
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
                      rows: 6,
                    }}
                    textFieldProps={{ isRequired: true }}
                  />

                  <ControlledSelectField
                    control={form.control}
                    description="Workspace where this automation should run."
                    label="Select project"
                    name="workspaceId"
                    options={workspaceOptions}
                  />

                  <ControlledSelectField
                    control={form.control}
                    description="How often this automation should run."
                    label="Schedule"
                    name="scheduleType"
                    options={SCHEDULE_OPTIONS}
                  />

                  <ControlledSelectField
                    control={form.control}
                    description="Choose whether this automation runs with Sentinel or Codex."
                    label="Engine"
                    name="chatEngine"
                    options={engineOptions}
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

                  {(scheduleType === "daily" ||
                    scheduleType === "weekdays") && (
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
                    selectProps={{ isDisabled: reasoningOptions.length === 0 }}
                  />
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button
                  isDisabled={isBusy}
                  onPress={() => state.close()}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button isDisabled={isBusy} isPending={isBusy} type="submit">
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Create
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

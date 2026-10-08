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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { upsertAutomationInList } from "@/components/automations/automation-list-cache";
import { getErrorMessage } from "@/lib/errors";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { AUTOMATION_SCHEDULE_TYPES, type ChatEngine } from "@/server/db/enums";
import type { AutomationTemplate } from "@/components/automations/automation-templates";
import {
  AutomationEngineFields,
  AutomationModelOptionFields,
} from "@/components/automations/automation-engine-fields";
import {
  AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE,
  getAvailableAutomationModels,
  getAutomationModelOptionDescriptors,
  getAutomationModelOptions,
  getAutomationModelsForInstance,
  getAutomationReasoningOptions,
  getAutomationUnattendedNotice,
  pruneAutomationOptionValues,
  resolveAutomationEngine,
  resolveAutomationInstanceId,
  resolveAutomationSelection,
  toAutomationModelOptions,
} from "@/components/automations/automation-form-helpers";
import type { EngineSelectOptionDescriptor } from "@/lib/ai/chat/engines/contract";
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
    /** The engine instance; its driver kind is sent as chatEngine. */
    engineInstanceId: z.string().trim().min(1, "Engine is required."),
    modelId: z.string().trim().min(1, "Model is required."),
    /** The selected model's option picks (agent, variant, …) by option id. */
    modelOptionValues: z.record(z.string(), z.string()),
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
    engineInstanceId?: string | null;
    modelId?: string | null;
    reasoningEffort?: ReasoningEffort | null;
  },
): AutomationFormValues {
  const defaultInstanceId = globalDefaults?.engineInstanceId ?? "sentinel";
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
      engineInstanceId: defaultInstanceId,
      modelId: defaultModelId,
      modelOptionValues: {},
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
    engineInstanceId: defaultInstanceId,
    modelId: defaultModelId,
    modelOptionValues: {},
    reasoningEffort: defaultReasoningEffort,
  };
}

function normalizeCreateInput(
  values: AutomationFormValues,
  chatEngine: ChatEngine,
  optionDescriptors: readonly EngineSelectOptionDescriptor[],
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
    chatEngine,
    chatEngineInstanceId: values.engineInstanceId,
    workspaceId:
      values.workspaceId === "__current__" ? null : values.workspaceId,
    scheduleType: values.scheduleType,
    scheduleDayOfWeek,
    scheduleTime,
    scheduleCron,
    modelId: values.modelId === "__default__" ? null : values.modelId,
    modelOptions:
      values.modelId === "__default__"
        ? null
        : toAutomationModelOptions(values.modelOptionValues, optionDescriptors),
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
  const catalogQuery = api.engines.composerCatalog.useQuery(undefined, {
    enabled: isOpen,
  });
  const securityQuery = api.security.get.useQuery(undefined, {
    enabled: isOpen,
  });
  const chatPreferencesQuery = api.chatPreferences.get.useQuery(undefined, {
    enabled: isOpen,
  });
  const createMutation = api.automations.create.useMutation();

  const catalogOptions = useMemo(
    () => catalogQuery.data?.options ?? [],
    [catalogQuery.data?.options],
  );
  const availableModelsByInstance = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(catalogQuery.data?.modelsByInstance ?? {}).map(
          ([instanceId, models]) => [
            instanceId,
            getAvailableAutomationModels(models),
          ],
        ),
      ),
    [catalogQuery.data?.modelsByInstance],
  );
  const engineOf = useCallback(
    (instanceId: string) =>
      resolveAutomationEngine(instanceId, catalogOptions, {
        chatEngine: chatPreferencesQuery.data?.engine,
        chatEngineInstanceId: chatPreferencesQuery.data?.engineInstanceId,
      }),
    [
      catalogOptions,
      chatPreferencesQuery.data?.engine,
      chatPreferencesQuery.data?.engineInstanceId,
    ],
  );
  const globalDefaults = useMemo(() => {
    const preferredInstanceId = resolveAutomationInstanceId({
      chatEngine: chatPreferencesQuery.data?.engine,
      chatEngineInstanceId: chatPreferencesQuery.data?.engineInstanceId,
    });
    const preferredReasoningEffort =
      (chatPreferencesQuery.data?.reasoningEffort as ReasoningEffort | null) ??
      null;
    const preferredModelId = chatPreferencesQuery.data?.modelId ?? null;

    const preferredModels = getAutomationModelsForInstance(
      preferredInstanceId,
      availableModelsByInstance,
    );

    const fallbackInstanceId = "sentinel";
    const instanceId =
      preferredModels.length > 0 || preferredInstanceId === fallbackInstanceId
        ? preferredInstanceId
        : fallbackInstanceId;
    const models = getAutomationModelsForInstance(
      instanceId,
      availableModelsByInstance,
    );
    const selection = resolveAutomationSelection(
      models,
      instanceId === preferredInstanceId ? preferredModelId : null,
      preferredReasoningEffort,
    );

    return {
      engineInstanceId: instanceId,
      modelId: selection.modelId,
      reasoningEffort: selection.reasoningEffort,
    };
  }, [
    availableModelsByInstance,
    chatPreferencesQuery.data?.engine,
    chatPreferencesQuery.data?.engineInstanceId,
    chatPreferencesQuery.data?.modelId,
    chatPreferencesQuery.data?.reasoningEffort,
  ]);
  const initialValues = useMemo(
    () =>
      createDefaultValues(template, {
        engineInstanceId: globalDefaults.engineInstanceId,
        modelId: globalDefaults.modelId,
        reasoningEffort: globalDefaults.reasoningEffort,
      }),
    [
      globalDefaults.engineInstanceId,
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
  const selectedInstanceId = form.watch("engineInstanceId");
  const selectedWorkspaceId = form.watch("workspaceId");
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

  const availableModels = useMemo(
    () =>
      getAutomationModelsForInstance(
        selectedInstanceId,
        availableModelsByInstance,
      ),
    [availableModelsByInstance, selectedInstanceId],
  );
  const unattendedNotice = useMemo(() => {
    const workspaces = workspacesQuery.data ?? [];
    const workspace =
      selectedWorkspaceId === "__current__"
        ? workspaces.find((candidate) => candidate.isSelected)
        : workspaces.find((candidate) => candidate.id === selectedWorkspaceId);
    return getAutomationUnattendedNotice(
      workspace?.permissionModeOverride ??
        securityQuery.data?.permissionMode ??
        null,
      catalogOptions.find((option) => option.instanceId === selectedInstanceId),
    );
  }, [
    catalogOptions,
    securityQuery.data?.permissionMode,
    selectedInstanceId,
    selectedWorkspaceId,
    workspacesQuery.data,
  ]);
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
  const optionDescriptors = useMemo(
    () => getAutomationModelOptionDescriptors(selectedModel),
    [selectedModel],
  );

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    const current = form.getValues("modelOptionValues");
    const pruned = pruneAutomationOptionValues(current, optionDescriptors);
    if (JSON.stringify(pruned) !== JSON.stringify(current)) {
      form.setValue("modelOptionValues", pruned);
    }
  }, [form, optionDescriptors, selectedModel]);

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
    catalogQuery.isLoading;

  const handleCreate = async (values: AutomationFormValues) => {
    setSubmitError("");

    try {
      const chatEngine = engineOf(values.engineInstanceId);
      if (!chatEngine) {
        setSubmitError(AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE);
        return;
      }
      const input = normalizeCreateInput(values, chatEngine, optionDescriptors);
      const validated = createAutomationSchema.safeParse(input);
      if (!validated.success) {
        setSubmitError(
          validated.error.issues[0]?.message ?? "Invalid automation.",
        );
        return;
      }

      const created = await createMutation.mutateAsync(validated.data);
      utils.automations.list.setData(undefined, (current) =>
        upsertAutomationInList(current, created),
      );
      void utils.automations.list.invalidate();
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
          <Modal.Dialog>
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

                  <Controller
                    control={form.control}
                    name="engineInstanceId"
                    render={({ field }) => (
                      <AutomationEngineFields
                        catalogOptions={catalogOptions}
                        driver={engineOf(field.value)}
                        instanceId={field.value}
                        notice={unattendedNotice}
                        onInstanceChange={field.onChange}
                      />
                    )}
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

                  <Controller
                    control={form.control}
                    name="modelOptionValues"
                    render={({ field }) => (
                      <AutomationModelOptionFields
                        descriptors={optionDescriptors}
                        onChange={field.onChange}
                        values={field.value}
                      />
                    )}
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

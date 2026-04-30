"use client";

import {
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  Form,
  Spinner,
  Switch,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import {
  addSentinelCustomModel,
  removeSentinelCustomModel,
  setSentinelModelEnabled,
} from "@/components/settings/model-cache-updates";
import { ProviderIcon } from "@/components/icons/provider-icon";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  type CustomModelFormValues,
  customModelFormSchema,
} from "@/schemas/settings.schema";
import type { AIProvider } from "@/server/db/enums";
import { api } from "@/trpc/react";

type ProviderKey = AIProvider;

const SENTINEL_MODELS_QUERY_INPUT = { engine: "sentinel" as const };

const CAPABILITY_LABEL: Record<string, string> = {
  object_generation: "Structured",
  reasoning: "Reasoning",
  tool_use: "Tools",
  vision: "Vision",
};

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

export default function ModelsPage() {
  const { data: models, isPending } = api.models.list.useQuery();
  const utils = api.useUtils();
  const invalidateModelCaches = useCallback(async () => {
    await Promise.all([
      utils.models.list.invalidate(),
      utils.engines.models.invalidate(SENTINEL_MODELS_QUERY_INPUT),
    ]);
  }, [utils.engines.models, utils.models.list]);

  const customModelForm = useForm<CustomModelFormValues>({
    defaultValues: {
      modelId: "",
      provider: "openai",
    },
    resolver: zodResolver(customModelFormSchema),
  });

  const [actionError, setActionError] = useState("");
  const [customError, setCustomError] = useState("");
  const [pendingToggleKey, setPendingToggleKey] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<
    Set<string | number>
  >(new Set());

  const enable = api.models.enable.useMutation({
    onMutate: async ({ modelId, provider }) => {
      await Promise.all([
        utils.models.list.cancel(),
        utils.engines.models.cancel(SENTINEL_MODELS_QUERY_INPUT),
      ]);
      const previousModels = utils.models.list.getData();
      const previousSentinelModels = utils.engines.models.getData(
        SENTINEL_MODELS_QUERY_INPUT,
      );
      utils.models.list.setData(undefined, (current) =>
        current?.map((model) =>
          model.provider === provider && model.modelId === modelId
            ? { ...model, isEnabled: true }
            : model,
        ),
      );
      utils.engines.models.setData(SENTINEL_MODELS_QUERY_INPUT, (current) =>
        setSentinelModelEnabled(current, {
          isEnabled: true,
          modelId,
          provider,
        }),
      );
      return { previousModels, previousSentinelModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
      utils.engines.models.setData(
        SENTINEL_MODELS_QUERY_INPUT,
        context?.previousSentinelModels,
      );
      sileo.error({ description: "Failed to enable model." });
    },
    onSettled: () => {
      void invalidateModelCaches();
    },
  });
  const disable = api.models.disable.useMutation({
    onMutate: async ({ modelId, provider }) => {
      await Promise.all([
        utils.models.list.cancel(),
        utils.engines.models.cancel(SENTINEL_MODELS_QUERY_INPUT),
      ]);
      const previousModels = utils.models.list.getData();
      const previousSentinelModels = utils.engines.models.getData(
        SENTINEL_MODELS_QUERY_INPUT,
      );
      utils.models.list.setData(undefined, (current) =>
        current?.map((model) =>
          model.provider === provider && model.modelId === modelId
            ? { ...model, isEnabled: false }
            : model,
        ),
      );
      utils.engines.models.setData(SENTINEL_MODELS_QUERY_INPUT, (current) =>
        setSentinelModelEnabled(current, {
          isEnabled: false,
          modelId,
          provider,
        }),
      );
      return { previousModels, previousSentinelModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
      utils.engines.models.setData(
        SENTINEL_MODELS_QUERY_INPUT,
        context?.previousSentinelModels,
      );
      sileo.error({ description: "Failed to disable model." });
    },
    onSettled: () => {
      void invalidateModelCaches();
    },
  });
  const addCustom = api.models.addCustom.useMutation({
    onMutate: async (variables) => {
      await Promise.all([
        utils.models.list.cancel(),
        utils.engines.models.cancel(SENTINEL_MODELS_QUERY_INPUT),
      ]);
      const previousModels = utils.models.list.getData();
      const previousSentinelModels = utils.engines.models.getData(
        SENTINEL_MODELS_QUERY_INPUT,
      );
      utils.models.list.setData(undefined, (current) => [
        ...(current ?? []),
        {
          capabilities: [],
          contextWindow: undefined,
          description: "Custom model",
          displayName: variables.modelId,
          isConnected: true,
          isCustom: true,
          isEnabled: true,
          modelId: variables.modelId,
          provider: variables.provider,
        },
      ]);
      utils.engines.models.setData(SENTINEL_MODELS_QUERY_INPUT, (current) =>
        addSentinelCustomModel(current, variables),
      );

      return { previousModels, previousSentinelModels };
    },
    onSuccess: (_, variables) => {
      customModelForm.reset({
        modelId: "",
        provider: variables.provider,
      });
      sileo.success({ description: "Custom model added." });
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
      utils.engines.models.setData(
        SENTINEL_MODELS_QUERY_INPUT,
        context?.previousSentinelModels,
      );
    },
    onSettled: () => {
      void invalidateModelCaches();
    },
  });
  const removeCustom = api.models.removeCustom.useMutation({
    onMutate: async ({ modelId, provider }) => {
      await Promise.all([
        utils.models.list.cancel(),
        utils.engines.models.cancel(SENTINEL_MODELS_QUERY_INPUT),
      ]);
      const previousModels = utils.models.list.getData();
      const previousSentinelModels = utils.engines.models.getData(
        SENTINEL_MODELS_QUERY_INPUT,
      );
      utils.models.list.setData(undefined, (current) =>
        current?.filter(
          (model) =>
            !(
              model.provider === provider &&
              model.modelId === modelId &&
              model.isCustom
            ),
        ),
      );
      utils.engines.models.setData(SENTINEL_MODELS_QUERY_INPUT, (current) =>
        removeSentinelCustomModel(current, {
          modelId,
          provider,
        }),
      );
      return { previousModels, previousSentinelModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
      utils.engines.models.setData(
        SENTINEL_MODELS_QUERY_INPUT,
        context?.previousSentinelModels,
      );
      sileo.error({ description: "Failed to remove model." });
    },
    onSettled: () => {
      void invalidateModelCaches();
    },
  });

  const grouped = models
    ? (Object.entries(
        models.reduce(
          (acc, model) => {
            const key = model.provider as ProviderKey;
            if (!acc[key]) {
              acc[key] = [];
            }
            acc[key].push(model);
            return acc;
          },
          {} as Record<ProviderKey, typeof models>,
        ),
      ) as [ProviderKey, typeof models][])
    : [];

  const connectedProviders = useMemo(
    () =>
      new Set(
        (models ?? [])
          .filter((model) => model.isConnected)
          .map((model) => model.provider as ProviderKey),
      ),
    [models],
  );

  const selectedProvider = customModelForm.watch("provider");

  const handleToggle = useCallback(
    async (provider: AIProvider, modelId: string, currentEnabled: boolean) => {
      if (pendingToggleKey) {
        return;
      }

      setActionError("");
      const toggleKey = `${provider}:${modelId}`;
      setPendingToggleKey(toggleKey);

      try {
        if (currentEnabled) {
          await disable.mutateAsync({ modelId, provider });
        } else {
          await enable.mutateAsync({ modelId, provider });
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to update that model.",
        );
      } finally {
        setPendingToggleKey((current) =>
          current === toggleKey ? null : current,
        );
      }
    },
    [pendingToggleKey, disable, enable],
  );

  const handleAddCustom = async (values: CustomModelFormValues) => {
    setCustomError("");

    try {
      await addCustom.mutateAsync({
        modelId: values.modelId.trim(),
        provider: values.provider,
      });
    } catch (error) {
      setCustomError(
        error instanceof Error
          ? error.message
          : "Unable to add the custom model.",
      );
    }
  };

  return (
    <SettingsPageWrapper
      subtitle="Enable or disable models and add custom ones."
      title="Models"
    >
      {isPending && !models ? (
        <SettingsLoadingSpinner />
      ) : (
        <>
          {actionError ? (
            <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {grouped.length > 0 && (
              <DisclosureGroup
                allowsMultipleExpanded
                expandedKeys={expandedProviders}
                onExpandedChange={setExpandedProviders}
              >
                <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
                  {grouped.map(([provider, providerModels]) => (
                    <Disclosure id={provider} key={provider}>
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-3.5 w-3.5"
                              provider={provider}
                            />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
                            {PROVIDERS[provider]?.displayName ?? provider}
                          </span>
                          {providerModels[0] &&
                          !providerModels[0].isConnected ? (
                            <Chip color="warning" size="sm" variant="soft">
                              Not connected
                            </Chip>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-muted text-[11px] tabular-nums">
                              {providerModels.filter((m) => m.isEnabled).length}
                              /{providerModels.length}
                            </span>
                            <Disclosure.Indicator />
                          </div>
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {providerModels.map((model) => (
                              <div
                                className="flex items-center gap-2.5 py-1.5 pl-9"
                                key={model.modelId}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className="text-foreground shrink-0 text-[13px]">
                                    {model.displayName}
                                  </span>
                                  {model.isCustom ? (
                                    <Chip size="sm" variant="soft">
                                      Custom
                                    </Chip>
                                  ) : null}
                                  <span className="text-muted hidden min-w-0 truncate text-[11px] sm:inline">
                                    {model.description}
                                  </span>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  {model.capabilities.length > 0 && (
                                    <div className="hidden gap-1 sm:flex">
                                      {model.capabilities.map((capability) => (
                                        <Chip
                                          color="default"
                                          key={capability}
                                          size="sm"
                                          variant="soft"
                                        >
                                          {CAPABILITY_LABEL[capability] ??
                                            capability}
                                        </Chip>
                                      ))}
                                    </div>
                                  )}
                                  {model.isCustom ? (
                                    <Button
                                      isDisabled={removeCustom.isPending}
                                      isPending={removeCustom.isPending}
                                      onPress={() =>
                                        removeCustom.mutate({
                                          modelId: model.modelId,
                                          provider:
                                            model.provider as ProviderKey,
                                        })
                                      }
                                      size="sm"
                                      variant="danger"
                                      className="h-6 min-w-0 px-2 text-[11px]"
                                    >
                                      {({ isPending }) => (
                                        <>
                                          {isPending ? (
                                            <Spinner
                                              color="current"
                                              size="sm"
                                            />
                                          ) : null}
                                          Remove
                                        </>
                                      )}
                                    </Button>
                                  ) : null}
                                  <Switch.Root
                                    aria-label={
                                      model.isEnabled
                                        ? "Disable model"
                                        : "Enable model"
                                    }
                                    className={
                                      pendingToggleKey ===
                                      `${model.provider}:${model.modelId}`
                                        ? "opacity-60"
                                        : undefined
                                    }
                                    isSelected={model.isEnabled}
                                    onChange={() =>
                                      handleToggle(
                                        model.provider as ProviderKey,
                                        model.modelId,
                                        model.isEnabled,
                                      )
                                    }
                                  >
                                    <Switch.Control>
                                      <Switch.Thumb />
                                    </Switch.Control>
                                  </Switch.Root>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Disclosure.Body>
                      </Disclosure.Content>
                    </Disclosure>
                  ))}
                </div>
              </DisclosureGroup>
            )}

            <div className="border-separator/20 bg-surface overflow-hidden rounded-2xl border">
              <Disclosure>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left">
                    <svg
                      className="text-muted h-3.5 w-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 5v14m-7-7h14"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-foreground text-[13px] font-medium">
                      Add Custom Model
                    </span>
                    <Disclosure.Indicator className="ml-auto" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="border-separator/20 border-t px-3 pb-2.5 pt-2.5">
                    <Form
                      className="flex items-end gap-2.5"
                      onSubmit={customModelForm.handleSubmit(handleAddCustom)}
                    >
                      <ControlledSelectField
                        control={customModelForm.control}
                        label="Provider"
                        name="provider"
                        options={Object.entries(PROVIDERS).map(
                          ([key, provider]) => ({
                            label: provider.displayName,
                            value: key,
                          }),
                        )}
                        selectProps={{ className: "w-44" }}
                      />

                      <ControlledTextField
                        control={customModelForm.control}
                        inputProps={{ placeholder: "e.g. gpt-5-turbo" }}
                        label="Model ID"
                        name="modelId"
                        textFieldProps={{
                          className: "flex-1",
                          isRequired: true,
                        }}
                      />

                      <Button
                        isDisabled={
                          addCustom.isPending ||
                          !connectedProviders.has(selectedProvider)
                        }
                        isPending={addCustom.isPending}
                        size="sm"
                        type="submit"
                        className="h-8"
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            Add
                          </>
                        )}
                      </Button>
                    </Form>

                    {!connectedProviders.has(selectedProvider) ? (
                      <p className="text-muted mt-1.5 text-[11px]">
                        Connect and enable this provider before adding a custom
                        model.
                      </p>
                    ) : null}

                    {customError ? (
                      <p className="text-danger mt-1.5 text-[11px]">
                        {customError}
                      </p>
                    ) : null}
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            </div>
          </div>
        </>
      )}
    </SettingsPageWrapper>
  );
}

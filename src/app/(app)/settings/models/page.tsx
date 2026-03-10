"use client";

import { Button, Chip, Form, Skeleton, Spinner, Switch } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { AIProvider } from "@/server/db/enums";
import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { PROVIDERS } from "@/lib/ai/providers";
import {
  type CustomModelFormValues,
  customModelFormSchema,
} from "@/schemas/settings.schema";
import { api } from "@/trpc/react";

type ProviderKey = "openai" | "anthropic" | "google" | "google_vertex";

const CAPABILITY_LABEL: Record<string, string> = {
  object_generation: "Structured",
  reasoning: "Reasoning",
  tool_use: "Tools",
  vision: "Vision",
};

function ModelsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <section key={sectionIndex}>
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>

          <div className="border-separator bg-surface rounded-xl border p-2">
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div
                  className="bg-background border-separator flex items-center gap-4 rounded-xl border px-4 py-3"
                  key={rowIndex}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 rounded-md" />
                    <Skeleton className="h-3 w-72 max-w-full rounded-md" />
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>

                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-80 max-w-full rounded-md" />
        </div>

        <div className="flex items-end gap-3">
          <div className="w-44 space-y-2">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <Skeleton className="h-10 w-16 rounded-xl" />
        </div>
      </section>
    </div>
  );
}

export default function ModelsPage() {
  const { data: models, isPending } = api.models.list.useQuery();
  const utils = api.useUtils();

  const enable = api.models.enable.useMutation({
    onMutate: async ({ modelId, provider }) => {
      const previousModels = utils.models.list.getData();
      utils.models.list.setData(undefined, (current) =>
        current?.map((model) =>
          model.provider === provider && model.modelId === modelId
            ? { ...model, isEnabled: true }
            : model,
        ),
      );
      return { previousModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
    },
  });
  const disable = api.models.disable.useMutation({
    onMutate: async ({ modelId, provider }) => {
      const previousModels = utils.models.list.getData();
      utils.models.list.setData(undefined, (current) =>
        current?.map((model) =>
          model.provider === provider && model.modelId === modelId
            ? { ...model, isEnabled: false }
            : model,
        ),
      );
      return { previousModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
    },
  });
  const addCustom = api.models.addCustom.useMutation({
    onMutate: async (variables) => {
      const previousModels = utils.models.list.getData();
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

      return { previousModels };
    },
    onSuccess: (_, variables) => {
      customModelForm.reset({
        modelId: "",
        provider: variables.provider,
      });
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
    },
  });
  const removeCustom = api.models.removeCustom.useMutation({
    onMutate: async ({ modelId, provider }) => {
      const previousModels = utils.models.list.getData();
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
      return { previousModels };
    },
    onError: (_error, _variables, context) => {
      utils.models.list.setData(undefined, context?.previousModels ?? []);
    },
  });

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

  const handleToggle = async (
    provider: AIProvider,
    modelId: string,
    currentEnabled: boolean,
  ) => {
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
        error instanceof Error ? error.message : "Unable to update that model.",
      );
    } finally {
      setPendingToggleKey((current) =>
        current === toggleKey ? null : current,
      );
    }
  };

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
      subtitle="Enable or disable models and add custom ones"
      title="Models"
    >
      {!models && isPending ? <ModelsSkeleton /> : null}

      {actionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-8">
        {grouped.map(([provider, providerModels]) => (
          <section key={provider}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-foreground text-sm font-medium">
                {PROVIDERS[provider]?.displayName ?? provider}
              </h2>
              {providerModels[0] && !providerModels[0].isConnected ? (
                <Chip color="warning" size="sm" variant="soft">
                  Not connected
                </Chip>
              ) : null}
            </div>

            <div className="border-separator bg-surface divide-separator divide-y rounded-xl border">
              {providerModels.map((model) => (
                <div
                  key={model.modelId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium">
                        {model.displayName}
                      </span>
                      {model.isCustom ? (
                        <Chip size="sm" variant="soft">
                          Custom
                        </Chip>
                      ) : null}
                    </div>
                    <p className="text-muted mt-0.5 text-xs">
                      {model.description}
                    </p>
                    {model.capabilities.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {model.capabilities.map((capability) => (
                          <Chip
                            color="default"
                            key={capability}
                            size="sm"
                            variant="soft"
                          >
                            {CAPABILITY_LABEL[capability] ?? capability}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {model.isCustom ? (
                      <Button
                        isDisabled={removeCustom.isPending}
                        isPending={removeCustom.isPending}
                        onPress={() =>
                          removeCustom.mutate({
                            modelId: model.modelId,
                            provider: model.provider as ProviderKey,
                          })
                        }
                        size="sm"
                        variant="danger"
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            Remove
                          </>
                        )}
                      </Button>
                    ) : null}
                    <Switch.Root
                      aria-label={
                        model.isEnabled ? "Disable model" : "Enable model"
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
          </section>
        ))}

        <section>
          <h2 className="text-foreground mb-2 text-sm font-medium">
            Add Custom Model
          </h2>
          <div className="border-separator bg-surface rounded-xl border px-4 py-2.5">
            <Form
              className="flex items-end gap-3"
              onSubmit={customModelForm.handleSubmit(handleAddCustom)}
            >
              <ControlledSelectField
                control={customModelForm.control}
                label="Provider"
                name="provider"
                options={Object.entries(PROVIDERS).map(([key, provider]) => ({
                  label: provider.displayName,
                  value: key,
                }))}
                selectProps={{ className: "w-44" }}
              />

              <ControlledTextField
                control={customModelForm.control}
                inputProps={{ placeholder: "e.g. gpt-5-turbo" }}
                label="Model ID"
                name="modelId"
                textFieldProps={{ className: "flex-1", isRequired: true }}
              />

              <Button
                isDisabled={
                  addCustom.isPending ||
                  !connectedProviders.has(selectedProvider)
                }
                isPending={addCustom.isPending}
                size="sm"
                type="submit"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Add
                  </>
                )}
              </Button>
            </Form>

            {!connectedProviders.has(selectedProvider) ? (
              <p className="text-muted mt-2 text-xs">
                Connect and enable this provider before adding a custom model.
              </p>
            ) : null}

            {customError ? (
              <p className="text-danger mt-2 text-xs">{customError}</p>
            ) : null}
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
}

"use client";

import { Button, Chip, Form, Skeleton, Spinner, Switch } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { AIProvider } from "@/../generated/prisma";
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

export default function ModelsPage() {
  const { data: models, isLoading } = api.models.list.useQuery();
  const utils = api.useUtils();

  const enable = api.models.enable.useMutation({
    onSuccess: () => void utils.models.list.invalidate(),
  });
  const disable = api.models.disable.useMutation({
    onSuccess: () => void utils.models.list.invalidate(),
  });
  const addCustom = api.models.addCustom.useMutation({
    onSuccess: (_, variables) => {
      void utils.models.list.invalidate();
      customModelForm.reset({
        modelId: "",
        provider: variables.provider,
      });
    },
  });
  const removeCustom = api.models.removeCustom.useMutation({
    onSuccess: () => void utils.models.list.invalidate(),
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
    setActionError("");

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
      {isLoading && (
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <section key={sectionIndex}>
              <div className="mb-3 flex items-center gap-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="border-separator rounded-xl border">
                {Array.from({ length: 3 }).map((__, rowIndex) => (
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${
                      rowIndex < 2 ? "border-separator border-b" : ""
                    }`}
                    key={rowIndex}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-36 rounded-md" />
                      <Skeleton className="h-3 w-64 rounded-md" />
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Skeleton className="h-6 w-10 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
                    <Switch
                      isDisabled={enable.isPending || disable.isPending}
                      isSelected={model.isEnabled}
                      onChange={() =>
                        handleToggle(
                          model.provider as ProviderKey,
                          model.modelId,
                          model.isEnabled,
                        )
                      }
                      size="sm"
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch>
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

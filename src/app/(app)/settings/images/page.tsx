"use client";

import { Button, Chip, Form, Skeleton, Switch } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import type {
  ImageGenerationProviderFormValues,
  ImageGenerationSettingsFormValues,
} from "@/schemas/image-settings.schema";
import {
  imageGenerationProviderFormSchema,
  imageGenerationSettingsFormSchema,
} from "@/schemas/image-settings.schema";
import { api } from "@/trpc/react";

type ImageProviderRow = {
  availableModels: Array<{
    description: string;
    displayName: string;
    id: string;
  }>;
  description: string;
  displayName: string;
  hasValidModel: boolean;
  isCustom: boolean;
  isEnabled: boolean;
  modelId: string | null;
  provider: ImageGenerationProviderFormValues["provider"];
  providerStatus: "active" | "disabled";
  supportsCustomModel: boolean;
};

function toProviderFormValues(
  provider: ImageProviderRow,
): ImageGenerationProviderFormValues {
  return {
    isCustom: provider.isCustom,
    isEnabled: provider.isEnabled,
    modelId: provider.modelId,
    provider: provider.provider,
  };
}

function ImagesSettingsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

function ProviderRow({ provider }: { provider: ImageProviderRow }) {
  const utils = api.useUtils();
  const form = useForm<ImageGenerationProviderFormValues>({
    defaultValues: toProviderFormValues(provider),
    resolver: zodResolver(imageGenerationProviderFormSchema),
  });

  useEffect(() => {
    form.reset(toProviderFormValues(provider));
  }, [form, provider]);

  const isCustom = form.watch("isCustom");
  const isEnabled = form.watch("isEnabled");
  const selectedModelId = form.watch("modelId");
  const hasSelectedModel = isCustom
    ? Boolean(selectedModelId?.trim())
    : provider.availableModels.some((model) => model.id === selectedModelId) ||
      (!selectedModelId && provider.availableModels.length > 0);
  const isReady =
    provider.providerStatus === "active" && isEnabled && hasSelectedModel;
  const builtInFallbackModelId = provider.availableModels[0]?.id ?? null;

  const updateProvider = api.imageSettings.updateProvider.useMutation({
    onSuccess: async (updatedProvider) => {
      if (updatedProvider) {
        utils.imageSettings.listProviders.setData(
          undefined,
          (current) =>
            current?.map((item) =>
              item.provider === updatedProvider.provider
                ? updatedProvider
                : item,
            ) ?? current,
        );
        form.reset(toProviderFormValues(updatedProvider));
      }

      await utils.imageSettings.get.invalidate();
      sileo.success({ description: "Image provider settings saved." });
    },
    onError: (error) => {
      sileo.error({ description: error.message });
    },
  });

  return (
    <Form
      className="space-y-3 px-4 py-3"
      onSubmit={form.handleSubmit(async (values) => {
        await updateProvider.mutateAsync(values);
      })}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {provider.displayName}
            </h2>
            <Chip
              color={
                provider.providerStatus === "active" ? "success" : "warning"
              }
              size="sm"
              variant="soft"
            >
              {provider.providerStatus === "active"
                ? "Credentials active"
                : "Credentials disabled"}
            </Chip>
            <Chip
              color={isReady ? "success" : "warning"}
              size="sm"
              variant="soft"
            >
              {isReady ? "Ready" : "Needs attention"}
            </Chip>
          </div>
          <p className="text-muted text-xs leading-5">{provider.description}</p>
        </div>

        <Button
          isDisabled={!form.formState.isDirty || updateProvider.isPending}
          isPending={updateProvider.isPending}
          size="sm"
          type="submit"
          variant="primary"
        >
          Save
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,1fr)]">
        <div className="border-separator/20 bg-background/60 rounded-xl border px-3 py-2.5">
          <Switch
            className="justify-between gap-3"
            isSelected={isEnabled}
            onChange={() =>
              form.setValue("isEnabled", !isEnabled, {
                shouldDirty: true,
                shouldTouch: true,
              })
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-muted text-xs">
                  Include this provider in generation.
                </p>
              </div>
            </Switch.Content>
          </Switch>
        </div>

        <div className="border-separator/20 bg-background/60 rounded-xl border px-3 py-2.5">
          <Switch
            className="justify-between gap-3"
            isDisabled={!provider.supportsCustomModel}
            isSelected={isCustom}
            onChange={() => {
              const nextIsCustom = !isCustom;

              form.setValue("isCustom", nextIsCustom, {
                shouldDirty: true,
                shouldTouch: true,
              });

              if (
                !nextIsCustom &&
                selectedModelId &&
                !provider.availableModels.some(
                  (model) => model.id === selectedModelId,
                )
              ) {
                form.setValue("modelId", builtInFallbackModelId, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Custom target</p>
                <p className="text-muted text-xs">
                  {provider.supportsCustomModel
                    ? "Use a custom model or deployment name."
                    : "Built-in catalog only for this provider."}
                </p>
              </div>
            </Switch.Content>
          </Switch>
        </div>

        {isCustom ? (
          <ControlledTextField
            control={form.control}
            description="Custom image model ID or deployment name."
            inputProps={{ placeholder: "e.g. gpt-image-1" }}
            label="Model target"
            name="modelId"
            textFieldProps={{ className: "w-full" }}
          />
        ) : (
          <ControlledSelectField
            control={form.control}
            description={
              provider.availableModels.length > 0
                ? "Built-in image model used for this provider."
                : "No built-in image models are available here."
            }
            label="Model target"
            name="modelId"
            options={provider.availableModels.map((model) => ({
              description: model.description,
              label: model.displayName,
              value: model.id,
            }))}
            placeholder="Select a model"
            selectProps={{
              className: "w-full",
              isDisabled: provider.availableModels.length === 0,
            }}
          />
        )}
      </div>
    </Form>
  );
}

export default function ImagesSettingsPage() {
  const utils = api.useUtils();
  const settingsQuery = api.imageSettings.get.useQuery();
  const providersQuery = api.imageSettings.listProviders.useQuery();
  const updateSettings = api.imageSettings.update.useMutation({
    onSuccess: (data) => {
      utils.imageSettings.get.setData(undefined, data);
      form.reset(data);
      sileo.success({ description: "Default image provider saved." });
    },
    onError: (error) => {
      sileo.error({ description: error.message });
    },
  });

  const form = useForm<ImageGenerationSettingsFormValues>({
    defaultValues: {
      defaultProvider: null,
    },
    resolver: zodResolver(imageGenerationSettingsFormSchema),
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    form.reset(settingsQuery.data);
  }, [form, settingsQuery.data]);

  const validProviders =
    providersQuery.data?.filter(
      (provider) =>
        provider.providerStatus === "active" &&
        provider.isEnabled &&
        provider.hasValidModel,
    ) ?? [];
  const configuredProviders = providersQuery.data ?? [];
  const inactiveCount = configuredProviders.filter(
    (provider) =>
      provider.providerStatus !== "active" ||
      !provider.isEnabled ||
      !provider.hasValidModel,
  ).length;
  const defaultProviderLabel = validProviders.find(
    (provider) => provider.provider === settingsQuery.data?.defaultProvider,
  )?.displayName;

  return (
    <SettingsPageWrapper
      subtitle="Choose default image providers, configure per-provider models, and control which providers can participate in image generation."
      title="Images"
    >
      {settingsQuery.isPending || providersQuery.isPending ? (
        <ImagesSettingsSkeleton />
      ) : (
        <div className="space-y-4">
          <Form
            className="rounded-2xl border border-separator/30 bg-surface p-4"
            onSubmit={form.handleSubmit(async (values) => {
              await updateSettings.mutateAsync(values);
            })}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Default routing
                  </h2>
                  <Chip color="success" size="sm" variant="soft">
                    {validProviders.length} ready
                  </Chip>
                  {inactiveCount > 0 ? (
                    <Chip color="warning" size="sm" variant="soft">
                      {inactiveCount} unavailable
                    </Chip>
                  ) : null}
                </div>
                <p className="text-muted max-w-2xl text-xs leading-5">
                  Choose the provider the assistant should use when a prompt
                  does not name one explicitly.
                </p>
                <p className="text-muted text-xs">
                  Active default: {defaultProviderLabel ?? "None selected"}
                </p>
              </div>

              <div className="grid w-full gap-3 lg:max-w-xl lg:grid-cols-[minmax(0,1fr)_auto]">
                <ControlledSelectField
                  control={form.control}
                  description="Only providers with active credentials and a valid image target appear here."
                  label="Default provider"
                  name="defaultProvider"
                  options={validProviders.map((provider) => ({
                    label: provider.displayName,
                    value: provider.provider,
                  }))}
                  placeholder="Select a provider"
                  selectProps={{
                    className: "w-full",
                    isDisabled: validProviders.length === 0,
                  }}
                />

                <div className="flex items-end justify-end">
                  <Button
                    isDisabled={
                      !form.formState.isDirty || updateSettings.isPending
                    }
                    isPending={updateSettings.isPending}
                    size="sm"
                    type="submit"
                    variant="primary"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </Form>

          {configuredProviders.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-separator/30 bg-surface">
              <div className="border-separator/20 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    Provider targets
                  </h2>
                  <p className="text-muted text-xs">
                    Keep each provider lean: enable it, pick its image target,
                    and save.
                  </p>
                </div>
                <Chip size="sm" variant="soft">
                  {configuredProviders.length} configured
                </Chip>
              </div>

              <div className="divide-separator/20 divide-y">
                {configuredProviders.map((provider) => (
                  <ProviderRow key={provider.provider} provider={provider} />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border border-separator/30 bg-surface p-5 text-sm text-muted">
              No image-capable providers are currently configured. Add provider
              credentials in Settings &gt; Providers first.
            </div>
          )}
        </div>
      )}
    </SettingsPageWrapper>
  );
}

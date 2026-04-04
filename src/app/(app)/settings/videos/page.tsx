"use client";

import { Button, Chip, Form, Spinner, Switch } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import type {
  VideoGenerationProviderFormValues,
  VideoGenerationSettingsFormValues,
} from "@/schemas/video-settings.schema";
import {
  videoGenerationProviderFormSchema,
  videoGenerationSettingsFormSchema,
} from "@/schemas/video-settings.schema";
import { api } from "@/trpc/react";

type VideoProviderRow = {
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
  provider: VideoGenerationProviderFormValues["provider"];
  providerStatus: "active" | "disabled";
  supportsCustomModel: boolean;
};

function toProviderFormValues(
  provider: VideoProviderRow,
): VideoGenerationProviderFormValues {
  return {
    isCustom: provider.isCustom,
    isEnabled: provider.isEnabled,
    modelId: provider.modelId,
    provider: provider.provider,
  };
}

function SettingsSectionRow({
  children,
  description,
  isFirst = false,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  isFirst?: boolean;
  title: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between${isFirst ? "" : " border-t border-border/50"}`}
    >
      <div className="space-y-1">
        <h2 className="text-foreground text-base font-medium">{title}</h2>
        <p className="text-muted text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsRowControl({
  children,
  widthClassName = "lg:w-[360px]",
}: {
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div
      className={`flex w-full max-w-full flex-col gap-2 ${widthClassName} lg:items-end`}
    >
      {children}
    </div>
  );
}

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

function ProviderRow({ provider }: { provider: VideoProviderRow }) {
  const utils = api.useUtils();
  const form = useForm<VideoGenerationProviderFormValues>({
    defaultValues: toProviderFormValues(provider),
    resolver: zodResolver(videoGenerationProviderFormSchema),
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

  const updateProvider = api.videoSettings.updateProvider.useMutation({
    onSuccess: async (updatedProvider) => {
      if (updatedProvider) {
        utils.videoSettings.listProviders.setData(
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

      await utils.videoSettings.get.invalidate();
      sileo.success({ description: "Video provider settings saved." });
    },
    onError: (error) => {
      sileo.error({ description: error.message });
    },
  });

  return (
    <Form
      className="border-t border-border/50 p-5"
      onSubmit={form.handleSubmit(async (values) => {
        await updateProvider.mutateAsync(values);
      })}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {provider.displayName}
            </span>
            <Chip
              color={
                provider.providerStatus === "active" ? "success" : "warning"
              }
              size="sm"
              variant="soft"
            >
              {provider.providerStatus === "active" ? "Active" : "Disabled"}
            </Chip>
            <Chip
              color={isReady ? "success" : "warning"}
              size="sm"
              variant="soft"
            >
              {isReady ? "Ready" : "Needs attention"}
            </Chip>
          </div>
          <p className="text-muted mt-0.5 text-xs">{provider.description}</p>
        </div>

        <Button
          isDisabled={!form.formState.isDirty || updateProvider.isPending}
          isPending={updateProvider.isPending}
          size="sm"
          type="submit"
        >
          Save
        </Button>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,1fr)]">
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
            description="Custom video model ID or deployment name."
            inputProps={{ placeholder: "e.g. gateway/google/veo-3.1" }}
            label="Model target"
            name="modelId"
            textFieldProps={{ className: "w-full" }}
          />
        ) : (
          <ControlledSelectField
            control={form.control}
            description={
              provider.availableModels.length > 0
                ? "Built-in video model used for this provider."
                : "No built-in video models are available here."
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

export default function VideosSettingsPage() {
  const utils = api.useUtils();
  const settingsQuery = api.videoSettings.get.useQuery();
  const providersQuery = api.videoSettings.listProviders.useQuery();
  const updateSettings = api.videoSettings.update.useMutation({
    onSuccess: (data) => {
      utils.videoSettings.get.setData(undefined, data);
      form.reset(data);
      sileo.success({ description: "Default video provider saved." });
    },
    onError: (error) => {
      sileo.error({ description: error.message });
    },
  });

  const form = useForm<VideoGenerationSettingsFormValues>({
    defaultValues: {
      defaultProvider: null,
    },
    resolver: zodResolver(videoGenerationSettingsFormSchema),
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

  return (
    <SettingsPageWrapper
      subtitle="Choose default video providers and configure per-provider models."
      title="Videos"
    >
      {settingsQuery.isPending || providersQuery.isPending ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-6">
          <Form
            onSubmit={form.handleSubmit(async (values) => {
              await updateSettings.mutateAsync(values);
            })}
          >
            <section className="border-separator/20 bg-surface rounded-2xl border">
              <SettingsSectionRow
                description="The provider used when a prompt does not name one explicitly."
                isFirst
                title="Default provider"
              >
                <SettingsRowControl>
                  <div className="w-full">
                    <ControlledSelectField
                      control={form.control}
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
                  </div>
                </SettingsRowControl>
              </SettingsSectionRow>

              <div className="flex justify-end border-t border-border/50 p-5">
                <Button
                  isDisabled={
                    !form.formState.isDirty || updateSettings.isPending
                  }
                  isPending={updateSettings.isPending}
                  size="sm"
                  type="submit"
                >
                  Save
                </Button>
              </div>
            </section>
          </Form>

          {configuredProviders.length > 0 ? (
            <section className="border-separator/20 bg-surface rounded-2xl border">
              <div className="flex items-center justify-between gap-3 p-5">
                <div className="space-y-1">
                  <h2 className="text-foreground text-base font-medium">
                    Provider targets
                  </h2>
                  <p className="text-muted text-sm">
                    Enable providers, pick their video model, and save.
                  </p>
                </div>
                <Chip size="sm" variant="soft">
                  {configuredProviders.length} configured
                </Chip>
              </div>

              {configuredProviders.map((provider) => (
                <ProviderRow key={provider.provider} provider={provider} />
              ))}
            </section>
          ) : (
            <div className="border-separator/20 bg-surface rounded-2xl border p-5 text-sm text-muted">
              No video-capable providers are currently configured. Add provider
              credentials in Settings &gt; Providers first.
            </div>
          )}
        </div>
      )}
    </SettingsPageWrapper>
  );
}

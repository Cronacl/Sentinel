"use client";

import { Button, Chip, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledSelectField,
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  voiceSettingsFormSchema,
  type VoiceSettingsFormValues,
} from "@/schemas/voice-settings.schema";
import { api } from "@/trpc/react";

const STATUS_COLOR = {
  active: "success",
  disabled: "warning",
  not_configured: "default",
} as const;

const STATUS_LABEL = {
  active: "Ready",
  disabled: "Disabled",
  not_configured: "Not configured",
} as const;

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
      <div className="space-y-1 max-w-2/3">
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

export default function VoiceSettingsPage() {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const voiceSettings = api.voiceSettings.get.useQuery();

  const form = useForm<VoiceSettingsFormValues>({
    defaultValues: {
      voiceInputEnabled: false,
      voiceInputModelId: null,
      voiceInputProvider: null,
    },
    resolver: zodResolver(voiceSettingsFormSchema),
  });

  useEffect(() => {
    if (!voiceSettings.data) {
      return;
    }

    form.reset({
      voiceInputEnabled: voiceSettings.data.voiceInputEnabled,
      voiceInputModelId: voiceSettings.data.voiceInputModelId,
      voiceInputProvider: voiceSettings.data.voiceInputProvider,
    });
  }, [form, voiceSettings.data]);

  const updateVoiceSettings = api.voiceSettings.update.useMutation({
    onSuccess: (data) => {
      utils.voiceSettings.get.setData(undefined, data);
      form.reset({
        voiceInputEnabled: data.voiceInputEnabled,
        voiceInputModelId: data.voiceInputModelId,
        voiceInputProvider: data.voiceInputProvider,
      });
      setSubmitError("");
      sileo.success({ description: "Voice settings saved." });
    },
    onError: (error) => {
      setSubmitError(error.message);
    },
  });

  const providerOptions = useMemo(
    () =>
      (voiceSettings.data?.providers ?? []).map((provider) => ({
        description: `${provider.description} • ${STATUS_LABEL[provider.status]}`,
        label: provider.displayName,
        value: provider.id,
      })),
    [voiceSettings.data?.providers],
  );

  const selectedProviderId = form.watch("voiceInputProvider");
  const voiceEnabled = form.watch("voiceInputEnabled");
  const selectedProvider = useMemo(
    () =>
      voiceSettings.data?.providers.find(
        (provider) => provider.id === selectedProviderId,
      ) ?? null,
    [selectedProviderId, voiceSettings.data?.providers],
  );

  const selectedModelId = form.watch("voiceInputModelId");

  const handleSubmit = async (values: VoiceSettingsFormValues) => {
    setSubmitError("");

    try {
      await updateVoiceSettings.mutateAsync(values);
    } catch {
      // mutation state handles the error
    }
  };

  const queryError = voiceSettings.error;

  return (
    <SettingsPageWrapper
      subtitle="Record prompts, transcribe with your chosen provider, and review before sending."
      title="Voice"
    >
      {queryError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {queryError.message}
        </p>
      ) : null}

      {submitError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

      {voiceSettings.data ? (
        <Form onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="flex flex-col gap-6">
            <section className="border-separator/20 bg-surface rounded-2xl border">
              <SettingsSectionRow
                description="Show a microphone in the composer when the selected provider supports transcription."
                isFirst
                title="Enable voice input"
              >
                <ControlledSwitchField
                  control={form.control}
                  label="Enable voice input"
                  name="voiceInputEnabled"
                  switchProps={{
                    isDisabled: updateVoiceSettings.isPending,
                    size: "sm",
                  }}
                />
              </SettingsSectionRow>

              <SettingsSectionRow
                description="Only providers with verified transcription support appear here."
                title="Provider"
              >
                <SettingsRowControl>
                  <div className="w-full">
                    <ControlledSelectField
                      control={form.control}
                      label="Provider"
                      name="voiceInputProvider"
                      options={providerOptions}
                      placeholder="Select a provider"
                      selectProps={{
                        className: "w-full",
                        isDisabled: updateVoiceSettings.isPending,
                      }}
                    />
                  </div>
                </SettingsRowControl>
              </SettingsSectionRow>

              {selectedProvider ? (
                <div className="border-t border-border/50 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {selectedProvider.displayName}
                      </div>
                      <p className="text-muted text-xs">
                        {selectedProvider.description}
                      </p>
                    </div>
                    <Chip
                      color={STATUS_COLOR[selectedProvider.status]}
                      size="sm"
                      variant="soft"
                    >
                      {STATUS_LABEL[selectedProvider.status]}
                    </Chip>
                  </div>

                  {selectedProvider.modelOptions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedProvider.modelOptions.map((model) => {
                        const isSelected = selectedModelId === model.id;
                        return (
                          <button
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                              isSelected
                                ? "border-accent bg-accent/10 text-foreground"
                                : "border-border/60 bg-background text-muted hover:text-foreground"
                            }`}
                            key={model.id}
                            onClick={(event) => {
                              event.preventDefault();
                              form.setValue("voiceInputModelId", model.id, {
                                shouldDirty: true,
                              });
                            }}
                            type="button"
                          >
                            {model.label}
                          </button>
                        );
                      })}

                      {selectedProvider.defaultModelId ? (
                        <button
                          className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                          onClick={(event) => {
                            event.preventDefault();
                            form.setValue("voiceInputModelId", null, {
                              shouldDirty: true,
                            });
                          }}
                          type="button"
                        >
                          Use default
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <ControlledTextField
                      control={form.control}
                      description={
                        selectedProvider.requiresModelOverride
                          ? "Enter the Azure OpenAI deployment or model ID used for transcription."
                          : "Optional override for a model ID outside the recommended list."
                      }
                      inputProps={{
                        placeholder: selectedProvider.requiresModelOverride
                          ? "my-transcription-deployment"
                          : (selectedProvider.defaultModelId ??
                            "Custom model ID"),
                      }}
                      label={
                        selectedProvider.requiresModelOverride
                          ? "Deployment or model ID"
                          : "Custom model override"
                      }
                      name="voiceInputModelId"
                      textFieldProps={{
                        isDisabled: updateVoiceSettings.isPending,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {voiceEnabled && voiceSettings.data.unavailableReason ? (
                <div className="border-t border-border/50 px-5 py-3">
                  <p className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                    {voiceSettings.data.unavailableReason}
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end border-t border-border/50 p-5">
                <Button
                  isDisabled={
                    updateVoiceSettings.isPending || !form.formState.isDirty
                  }
                  isPending={updateVoiceSettings.isPending}
                  size="sm"
                  type="submit"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Save
                    </>
                  )}
                </Button>
              </div>
            </section>

            <section className="border-separator/20 bg-surface rounded-2xl border">
              <div className="p-5">
                <h2 className="text-foreground text-base font-medium">
                  Supported providers
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Sentinel supports voice input for OpenAI, Groq, and Azure
                  OpenAI.
                </p>
              </div>

              <div className="divide-separator/50 divide-y border-t border-border/50">
                {voiceSettings.data.providers.map((provider) => (
                  <div
                    className="flex items-center justify-between gap-3 px-5 py-3.5"
                    key={provider.id}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground text-sm font-medium">
                        {provider.displayName}
                      </span>
                      <p className="text-muted mt-0.5 text-xs">
                        {provider.defaultModelId
                          ? `Default: ${provider.defaultModelId}`
                          : "Requires a deployment or custom model ID."}
                      </p>
                    </div>
                    <Chip
                      color={STATUS_COLOR[provider.status]}
                      size="sm"
                      variant="soft"
                    >
                      {STATUS_LABEL[provider.status]}
                    </Chip>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </Form>
      ) : (
        <div className="flex items-center justify-center py-48">
          <Spinner size="sm" />
        </div>
      )}
    </SettingsPageWrapper>
  );
}

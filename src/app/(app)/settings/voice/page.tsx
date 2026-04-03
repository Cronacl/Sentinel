"use client";

import { Button, Chip, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
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

  return (
    <SettingsPageWrapper
      subtitle="Record a prompt directly in the composer, transcribe it with your chosen provider, and review the transcript before sending."
      title="Voice"
    >
      {voiceSettings.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {voiceSettings.error.message}
        </p>
      ) : null}

      {submitError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

      {voiceSettings.data ? (
        <Form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="mb-5 space-y-1">
              <h2 className="text-foreground text-base font-medium">
                Voice input
              </h2>
              <p className="text-muted text-sm">
                When enabled, Sentinel shows a microphone in the composer only
                when the selected provider is configured and supports
                transcription.
              </p>
            </div>

            <ControlledSwitchField
              control={form.control}
              description="Keep voice enabled even if the selected provider is temporarily unavailable. Sentinel will hide the mic in the composer until the provider is ready again."
              label="Enable voice input"
              name="voiceInputEnabled"
              switchProps={{
                isDisabled: updateVoiceSettings.isPending,
                size: "sm",
              }}
            />
          </section>

          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="mb-5 space-y-1">
              <h2 className="text-foreground text-base font-medium">
                Provider and model
              </h2>
              <p className="text-muted text-sm">
                Pick the transcription provider Sentinel should use for recorded
                prompts.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <ControlledSelectField
                control={form.control}
                description="Only providers with verified transcription support appear here."
                label="Provider"
                name="voiceInputProvider"
                options={providerOptions}
                placeholder="Select a provider"
                selectProps={{ isDisabled: updateVoiceSettings.isPending }}
              />

              {selectedProvider ? (
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
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

                  {!selectedProvider.requiresModelOverride &&
                  selectedProvider.defaultModelId ? (
                    <p className="mt-3 text-xs text-muted">
                      Leave the field blank to use{" "}
                      <span className="text-foreground">
                        {selectedProvider.defaultModelId}
                      </span>
                      .
                    </p>
                  ) : null}

                  {selectedProvider.modelOptions.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
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

                  <div className="mt-4">
                    <ControlledTextField
                      control={form.control}
                      description={
                        selectedProvider.requiresModelOverride
                          ? "Enter the Azure OpenAI deployment or model ID used for transcription."
                          : "Optional override. Use this when you want a model ID outside the recommended list."
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
                <p className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                  {voiceSettings.data.unavailableReason}
                </p>
              ) : null}
            </div>
          </section>

          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="mb-5 space-y-1">
              <h2 className="text-foreground text-base font-medium">
                Supported providers
              </h2>
              <p className="text-muted text-sm">
                Sentinel currently exposes voice input for OpenAI, Groq, and
                Azure OpenAI.
              </p>
            </div>

            <div className="grid gap-3">
              {voiceSettings.data.providers.map((provider) => (
                <div
                  className="rounded-2xl border border-border/50 bg-background/70 p-4"
                  key={provider.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {provider.displayName}
                      </div>
                      <p className="text-muted text-xs">
                        {provider.description}
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

                  <p className="mt-3 text-xs text-muted">
                    {provider.defaultModelId
                      ? `Default model: ${provider.defaultModelId}`
                      : "Requires a deployment or custom model ID."}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end">
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
        </Form>
      ) : null}
    </SettingsPageWrapper>
  );
}

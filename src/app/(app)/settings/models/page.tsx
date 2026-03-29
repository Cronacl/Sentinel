"use client";

import {
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  Form,
  Skeleton,
  Spinner,
  Switch,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import type { AIProvider } from "@/server/db/enums";
import { ProviderIcon } from "@/components/icons/provider-icon";
import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import {
  getClaudeRuntimeBadgeColor,
  getClaudeRuntimeBadgeLabel,
  getClaudeRuntimeBinaryLabel,
  getClaudeRuntimeFallbackMessage,
} from "@/components/settings/runtime-status";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  type CustomModelFormValues,
  customModelFormSchema,
} from "@/schemas/settings.schema";
import { api } from "@/trpc/react";

type ProviderKey = AIProvider;
type RuntimeEngineKey = "claude" | "codex";

const CAPABILITY_LABEL: Record<string, string> = {
  object_generation: "Structured",
  reasoning: "Reasoning",
  tool_use: "Tools",
  vision: "Vision",
};

function ModelsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            className="border-separator/20 bg-surface rounded-2xl border px-4 py-3"
            key={i}
          >
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((__, j) => (
                <div className="flex items-center justify-between" key={j}>
                  <Skeleton className="h-3 w-12 rounded-md" />
                  <Skeleton className="h-3 w-20 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="flex items-center gap-3 px-4 py-2.5" key={i}>
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="ml-auto h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const { data: models, isPending } = api.models.list.useQuery();
  const enginesQuery = api.engines.list.useQuery();
  const utils = api.useUtils();
  const codexEngine = enginesQuery.data?.find(
    (engine) => engine.engine === "codex",
  );
  const codexStatus =
    codexEngine?.engine === "codex" && "status" in codexEngine
      ? codexEngine.status
      : null;
  const claudeEngine = enginesQuery.data?.find(
    (engine) => engine.engine === "claude",
  );
  const claudeStatus =
    claudeEngine?.engine === "claude" && "status" in claudeEngine
      ? claudeEngine.status
      : null;

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
      sileo.error({ description: "Failed to enable model." });
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
      sileo.error({ description: "Failed to disable model." });
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
      sileo.success({ description: "Custom model added." });
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
      sileo.error({ description: "Failed to remove model." });
    },
  });
  const refreshRuntimeStatus = api.engines.refreshStatus.useMutation();

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
  const [pendingRuntimeRefresh, setPendingRuntimeRefresh] =
    useState<RuntimeEngineKey | null>(null);
  const [showCodexAccount, setShowCodexAccount] = useState(false);
  const [showClaudeAccount, setShowClaudeAccount] = useState(false);

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

  const handleRefreshRuntime = useCallback(
    async (engine: RuntimeEngineKey) => {
      if (pendingRuntimeRefresh) {
        return;
      }

      setActionError("");
      setPendingRuntimeRefresh(engine);

      try {
        const refreshed = await refreshRuntimeStatus.mutateAsync({ engine });
        await Promise.all([
          utils.engines.list.invalidate(),
          utils.engines.models.invalidate(),
        ]);

        if (refreshed.status.error) {
          sileo.error({ description: refreshed.status.error });
        } else {
          sileo.success({
            description:
              engine === "codex"
                ? "Codex detection reloaded."
                : "Claude detection reloaded.",
          });
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to reload runtime detection.",
        );
      } finally {
        setPendingRuntimeRefresh((current) =>
          current === engine ? null : current,
        );
      }
    },
    [
      pendingRuntimeRefresh,
      refreshRuntimeStatus,
      utils.engines.list,
      utils.engines.models,
    ],
  );

  const hasCodexModels =
    codexStatus?.availableModels && codexStatus.availableModels.length > 0;
  const hasClaudeModels =
    claudeStatus?.availableModels && claudeStatus.availableModels.length > 0;
  const isRefreshingCodex = pendingRuntimeRefresh === "codex";
  const isRefreshingClaude = pendingRuntimeRefresh === "claude";
  const claudeFallbackMessage = getClaudeRuntimeFallbackMessage(claudeStatus);

  return (
    <SettingsPageWrapper
      subtitle="Enable or disable models and add custom ones"
      title="Models"
    >
      {isPending && !models ? (
        <ModelsSkeleton />
      ) : (
        <>
          {actionError ? (
            <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-col gap-6">
            {/* ── Runtime status cards: side-by-side on large screens ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="border-separator/20 bg-surface rounded-2xl border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-foreground text-sm font-medium">
                    Codex Runtime
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      isDisabled={isRefreshingCodex}
                      isPending={isRefreshingCodex}
                      onPress={() => void handleRefreshRuntime("codex")}
                      size="sm"
                      variant="secondary"
                    >
                      Reload
                    </Button>
                    <Chip
                      color={codexEngine?.isAvailable ? "success" : "warning"}
                      size="sm"
                      variant="soft"
                    >
                      {codexEngine?.isAvailable ? "Ready" : "Setup needed"}
                    </Chip>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">CLI</span>
                    <span className="text-foreground">
                      {codexStatus?.cliDetected
                        ? (codexStatus.cliVersion ?? "Detected")
                        : "Not detected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Auth</span>
                    <span className="text-foreground">
                      {codexStatus?.authReady
                        ? "Ready"
                        : codexStatus?.requiresOpenaiAuth
                          ? "Login needed"
                          : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Models</span>
                    <span className="text-foreground">
                      {codexStatus?.availableModels.length ?? 0} available
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Account</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-foreground">
                        {(() => {
                          const raw =
                            codexStatus?.account?.type === "chatgpt"
                              ? codexStatus.account.email
                              : codexStatus?.account?.type === "apiKey"
                                ? "API key"
                                : null;
                          if (!raw) return "Not authenticated";
                          if (raw === "API key") return raw;
                          return showCodexAccount
                            ? raw
                            : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
                        })()}
                      </span>
                      {codexStatus?.account?.type === "chatgpt" && (
                        <button
                          className="text-muted hover:text-foreground shrink-0 transition-colors"
                          onClick={() => setShowCodexAccount((v) => !v)}
                          type="button"
                        >
                          {showCodexAccount ? (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                {!codexEngine?.isAvailable && codexEngine?.error ? (
                  <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2.5 py-1.5 text-xs">
                    {codexEngine.error}
                  </p>
                ) : null}
              </section>

              <section className="border-separator/20 bg-surface rounded-2xl border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-foreground text-sm font-medium">
                    Claude Code Runtime
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      isDisabled={isRefreshingClaude}
                      isPending={isRefreshingClaude}
                      onPress={() => void handleRefreshRuntime("claude")}
                      size="sm"
                      variant="secondary"
                    >
                      Reload
                    </Button>
                    <Chip
                      color={getClaudeRuntimeBadgeColor(
                        claudeStatus,
                        claudeEngine?.isAvailable ?? false,
                      )}
                      size="sm"
                      variant="soft"
                    >
                      {getClaudeRuntimeBadgeLabel(
                        claudeStatus,
                        claudeEngine?.isAvailable ?? false,
                      )}
                    </Chip>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Binary</span>
                    <span className="text-foreground">
                      {getClaudeRuntimeBinaryLabel(claudeStatus)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Auth</span>
                    <span className="text-foreground">
                      {claudeStatus?.authReady ? "Ready" : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Models</span>
                    <span className="text-foreground">
                      {claudeStatus?.availableModels.length ?? 0} available
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Account</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-foreground">
                        {(() => {
                          const raw = claudeStatus?.account?.email ?? null;
                          if (!raw) return "Not authenticated";
                          return showClaudeAccount
                            ? raw
                            : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
                        })()}
                      </span>
                      {claudeStatus?.account?.email && (
                        <button
                          className="text-muted hover:text-foreground shrink-0 transition-colors"
                          onClick={() => setShowClaudeAccount((v) => !v)}
                          type="button"
                        >
                          {showClaudeAccount ? (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                {claudeFallbackMessage ? (
                  <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2.5 py-1.5 text-xs">
                    {claudeFallbackMessage}
                  </p>
                ) : null}

                {!claudeFallbackMessage &&
                !claudeEngine?.isAvailable &&
                claudeEngine?.error ? (
                  <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2.5 py-1.5 text-xs">
                    {claudeEngine.error}
                  </p>
                ) : null}
              </section>
            </div>

            {/* ── Runtime model lists + Provider model groups (all collapsible) ── */}
            {(hasCodexModels || hasClaudeModels || grouped.length > 0) && (
              <DisclosureGroup
                allowsMultipleExpanded
                expandedKeys={expandedProviders}
                onExpandedChange={setExpandedProviders}
              >
                <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
                  {/* Codex runtime models */}
                  {hasCodexModels && (
                    <Disclosure id="runtime-codex">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-4 w-4"
                              provider="openai"
                            />
                          </div>
                          <span className="text-foreground text-sm font-medium">
                            Codex Models
                          </span>
                          <Chip size="sm" variant="soft">
                            {codexStatus!.availableModels.length}
                          </Chip>
                          <Disclosure.Indicator className="ml-auto" />
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-4 pb-2">
                            {codexStatus!.availableModels.map((model) => (
                              <div
                                className="flex items-center gap-3 py-2 pl-10"
                                key={model.id}
                              >
                                <span className="text-foreground min-w-0 shrink-0 text-sm">
                                  {model.displayName}
                                </span>
                                {model.isDefault && (
                                  <Chip color="accent" size="sm" variant="soft">
                                    Default
                                  </Chip>
                                )}
                                <span className="text-muted min-w-0 flex-1 truncate text-xs">
                                  {model.description}
                                </span>
                                <div className="flex shrink-0 gap-1">
                                  {model.inputModalities.map((modality) => (
                                    <Chip
                                      key={modality}
                                      size="sm"
                                      variant="soft"
                                    >
                                      {modality}
                                    </Chip>
                                  ))}
                                  {model.supportsPersonality && (
                                    <Chip size="sm" variant="soft">
                                      Personality
                                    </Chip>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </Disclosure.Body>
                      </Disclosure.Content>
                    </Disclosure>
                  )}

                  {/* Claude Code runtime models */}
                  {hasClaudeModels && (
                    <Disclosure id="runtime-claude">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-4 w-4"
                              provider="anthropic"
                            />
                          </div>
                          <span className="text-foreground text-sm font-medium">
                            Claude Code Models
                          </span>
                          <Chip size="sm" variant="soft">
                            {claudeStatus!.availableModels.length}
                          </Chip>
                          <Disclosure.Indicator className="ml-auto" />
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-4 pb-2">
                            {claudeStatus!.availableModels.map((model) => (
                              <div
                                className="flex items-center gap-3 py-2 pl-10"
                                key={model.id}
                              >
                                <span className="text-foreground min-w-0 shrink-0 text-sm">
                                  {model.displayName}
                                </span>
                                {model.isDefault && (
                                  <Chip color="accent" size="sm" variant="soft">
                                    Default
                                  </Chip>
                                )}
                                <span className="text-muted min-w-0 flex-1 truncate text-xs">
                                  {model.description}
                                </span>
                                <div className="flex shrink-0 gap-1">
                                  {model.inputModalities.map((modality) => (
                                    <Chip
                                      key={modality}
                                      size="sm"
                                      variant="soft"
                                    >
                                      {modality}
                                    </Chip>
                                  ))}
                                  {model.contextWindow && (
                                    <Chip size="sm" variant="soft">
                                      {(model.contextWindow / 1000).toFixed(0)}k
                                      ctx
                                    </Chip>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </Disclosure.Body>
                      </Disclosure.Content>
                    </Disclosure>
                  )}

                  {/* Provider model groups */}
                  {grouped.map(([provider, providerModels]) => (
                    <Disclosure id={provider} key={provider}>
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-4 w-4"
                              provider={provider}
                            />
                          </div>
                          <span className="text-foreground text-sm font-medium">
                            {PROVIDERS[provider]?.displayName ?? provider}
                          </span>
                          {providerModels[0] &&
                          !providerModels[0].isConnected ? (
                            <Chip color="warning" size="sm" variant="soft">
                              Not connected
                            </Chip>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-muted text-xs tabular-nums">
                              {providerModels.filter((m) => m.isEnabled).length}
                              /{providerModels.length} enabled
                            </span>
                            <Disclosure.Indicator />
                          </div>
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-4 pb-2">
                            {providerModels.map((model) => (
                              <div
                                className="flex items-center gap-3 py-2 pl-10"
                                key={model.modelId}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="text-foreground shrink-0 text-sm">
                                    {model.displayName}
                                  </span>
                                  {model.isCustom ? (
                                    <Chip size="sm" variant="soft">
                                      Custom
                                    </Chip>
                                  ) : null}
                                  <span className="text-muted hidden min-w-0 truncate text-xs sm:inline">
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

            {/* ── Add custom model (collapsible) ── */}
            <div className="border-separator/20 bg-surface overflow-hidden rounded-2xl border">
              <Disclosure>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left">
                    <svg
                      className="h-4 w-4 shrink-0 text-muted"
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
                    <span className="text-foreground text-sm font-medium">
                      Add Custom Model
                    </span>
                    <Disclosure.Indicator className="ml-auto" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="border-separator/20 border-t px-4 pb-3 pt-3">
                    <Form
                      className="flex items-end gap-3"
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
                      <p className="text-muted mt-2 text-xs">
                        Connect and enable this provider before adding a custom
                        model.
                      </p>
                    ) : null}

                    {customError ? (
                      <p className="text-danger mt-2 text-xs">{customError}</p>
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

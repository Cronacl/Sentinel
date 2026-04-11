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
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import type { AIProvider } from "@/server/db/enums";
import { CopilotIcon } from "@/components/icons/copilot-icon";
import { ProviderIcon } from "@/components/icons/provider-icon";
import {
  ControlledSelectField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import {
  getCodexRuntimeBadgeColor,
  getCodexRuntimeBadgeLabel,
  getCodexRuntimeCliLabel,
  getCodexRuntimeFallbackMessage,
  getClaudeRuntimeBadgeColor,
  getClaudeRuntimeBadgeLabel,
  getClaudeRuntimeBinaryLabel,
  getClaudeRuntimeFallbackMessage,
  getCopilotRuntimeBadgeColor,
  getCopilotRuntimeBadgeLabel,
  getCopilotRuntimeCliLabel,
  getCopilotRuntimeFallbackMessage,
} from "@/components/settings/runtime-status";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  type CustomModelFormValues,
  customModelFormSchema,
} from "@/schemas/settings.schema";
import { api } from "@/trpc/react";

type ProviderKey = AIProvider;
type RuntimeEngineKey = "claude" | "codex" | "copilot";

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

function RuntimeCard({
  title,
  badge,
  badgeColor,
  rows,
  fallbackMessage,
  engineError,
  isRefreshing,
  onRefresh,
}: {
  title: string;
  badge: string;
  badgeColor: "success" | "warning" | "danger" | "default";
  rows: { label: string; value: ReactNode }[];
  fallbackMessage: string | null;
  engineError: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="border-separator/20 rounded-2xl border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground text-[13px] font-medium">{title}</span>
        <div className="flex items-center gap-1.5">
          <Button
            isDisabled={isRefreshing}
            isPending={isRefreshing}
            onPress={onRefresh}
            size="sm"
            variant="secondary"
            className="h-6 min-w-0 px-2 text-[11px]"
          >
            Reload
          </Button>
          <Chip color={badgeColor} size="sm" variant="soft">
            {badge}
          </Chip>
        </div>
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {rows.map((row) => (
          <div className="flex items-center justify-between" key={row.label}>
            <span className="text-muted">{row.label}</span>
            <span className="text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
      {fallbackMessage ? (
        <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2 py-1 text-[11px]">
          {fallbackMessage}
        </p>
      ) : engineError ? (
        <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2 py-1 text-[11px]">
          {engineError}
        </p>
      ) : null}
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
  const copilotEngine = enginesQuery.data?.find(
    (engine) => engine.engine === "copilot",
  );
  const copilotStatus =
    copilotEngine?.engine === "copilot" && "status" in copilotEngine
      ? copilotEngine.status
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
  const [showCopilotAccount, setShowCopilotAccount] = useState(false);

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
                : engine === "claude"
                  ? "Claude detection reloaded."
                  : "Copilot detection reloaded.",
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
  const hasCopilotModels =
    copilotStatus?.availableModels && copilotStatus.availableModels.length > 0;
  const isRefreshingCodex = pendingRuntimeRefresh === "codex";
  const isRefreshingClaude = pendingRuntimeRefresh === "claude";
  const isRefreshingCopilot = pendingRuntimeRefresh === "copilot";
  const codexFallbackMessage = getCodexRuntimeFallbackMessage(codexStatus);
  const claudeFallbackMessage = getClaudeRuntimeFallbackMessage(claudeStatus);
  const copilotFallbackMessage =
    getCopilotRuntimeFallbackMessage(copilotStatus);

  const codexAccountValue = (() => {
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
  })();

  const claudeAccountValue = (() => {
    const raw = claudeStatus?.account?.email ?? null;
    if (!raw) return "Not authenticated";
    return showClaudeAccount
      ? raw
      : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  })();
  const copilotAccountValue = (() => {
    const login = copilotStatus?.account?.login ?? null;
    const host = copilotStatus?.account?.host ?? null;
    const authType = copilotStatus?.account?.authType ?? null;
    const raw =
      (login && host && `${login} @ ${host}`) ||
      login ||
      (host && authType && `${authType} @ ${host}`) ||
      host ||
      authType;

    if (raw) {
      return showCopilotAccount
        ? raw
        : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    }

    return copilotStatus?.authReady ? "Authenticated" : "Not authenticated";
  })();

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
            <div className="grid gap-1.5">
              <RuntimeCard
                title="Codex Runtime"
                badge={getCodexRuntimeBadgeLabel(
                  codexStatus,
                  codexEngine?.isAvailable ?? false,
                )}
                badgeColor={getCodexRuntimeBadgeColor(
                  codexStatus,
                  codexEngine?.isAvailable ?? false,
                )}
                rows={[
                  { label: "CLI", value: getCodexRuntimeCliLabel(codexStatus) },
                  {
                    label: "Auth",
                    value: codexStatus?.authReady
                      ? "Ready"
                      : codexStatus?.requiresOpenaiAuth
                        ? "Login needed"
                        : "Unavailable",
                  },
                  {
                    label: "Models",
                    value: `${codexStatus?.availableModels.length ?? 0} available`,
                  },
                  {
                    label: "Account",
                    value: (
                      <div className="flex items-center gap-2">
                        <span>{codexAccountValue}</span>
                        {codexAccountValue !== "Not authenticated" &&
                        codexAccountValue !== "API key" ? (
                          <Button
                            className="h-5 min-w-0 px-1.5 text-[10px]"
                            onPress={() =>
                              setShowCodexAccount((current) => !current)
                            }
                            size="sm"
                            variant="secondary"
                          >
                            {showCodexAccount ? "Hide" : "Show"}
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                fallbackMessage={codexFallbackMessage}
                engineError={
                  !codexFallbackMessage &&
                  !codexEngine?.isAvailable &&
                  codexEngine?.error
                    ? codexEngine.error
                    : null
                }
                isRefreshing={isRefreshingCodex}
                onRefresh={() => void handleRefreshRuntime("codex")}
              />
              <RuntimeCard
                title="Claude Code Runtime"
                badge={getClaudeRuntimeBadgeLabel(
                  claudeStatus,
                  claudeEngine?.isAvailable ?? false,
                )}
                badgeColor={getClaudeRuntimeBadgeColor(
                  claudeStatus,
                  claudeEngine?.isAvailable ?? false,
                )}
                rows={[
                  {
                    label: "Binary",
                    value: getClaudeRuntimeBinaryLabel(claudeStatus),
                  },
                  {
                    label: "Auth",
                    value: claudeStatus?.authReady ? "Ready" : "Unavailable",
                  },
                  {
                    label: "Models",
                    value: `${claudeStatus?.availableModels.length ?? 0} available`,
                  },
                  {
                    label: "Account",
                    value: (
                      <div className="flex items-center gap-2">
                        <span>{claudeAccountValue}</span>
                        {claudeAccountValue !== "Not authenticated" ? (
                          <Button
                            className="h-5 min-w-0 px-1.5 text-[10px]"
                            onPress={() =>
                              setShowClaudeAccount((current) => !current)
                            }
                            size="sm"
                            variant="secondary"
                          >
                            {showClaudeAccount ? "Hide" : "Show"}
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                fallbackMessage={claudeFallbackMessage}
                engineError={
                  !claudeFallbackMessage &&
                  !claudeEngine?.isAvailable &&
                  claudeEngine?.error
                    ? claudeEngine.error
                    : null
                }
                isRefreshing={isRefreshingClaude}
                onRefresh={() => void handleRefreshRuntime("claude")}
              />
              <RuntimeCard
                title="GitHub Copilot Runtime"
                badge={getCopilotRuntimeBadgeLabel(
                  copilotStatus,
                  copilotEngine?.isAvailable ?? false,
                )}
                badgeColor={getCopilotRuntimeBadgeColor(
                  copilotStatus,
                  copilotEngine?.isAvailable ?? false,
                )}
                rows={[
                  {
                    label: "CLI",
                    value: getCopilotRuntimeCliLabel(copilotStatus),
                  },
                  {
                    label: "Auth",
                    value: copilotStatus?.authReady ? "Ready" : "Unavailable",
                  },
                  {
                    label: "Models",
                    value: `${copilotStatus?.availableModels.length ?? 0} available`,
                  },
                  {
                    label: "Account",
                    value: (
                      <div className="flex items-center gap-2">
                        <span>{copilotAccountValue}</span>
                        {copilotAccountValue !== "Not authenticated" &&
                        copilotAccountValue !== "Authenticated" ? (
                          <Button
                            className="h-5 min-w-0 px-1.5 text-[10px]"
                            onPress={() =>
                              setShowCopilotAccount((current) => !current)
                            }
                            size="sm"
                            variant="secondary"
                          >
                            {showCopilotAccount ? "Hide" : "Show"}
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                fallbackMessage={copilotFallbackMessage}
                engineError={
                  !copilotFallbackMessage &&
                  !copilotEngine?.isAvailable &&
                  copilotEngine?.error
                    ? copilotEngine.error
                    : null
                }
                isRefreshing={isRefreshingCopilot}
                onRefresh={() => void handleRefreshRuntime("copilot")}
              />
            </div>

            {(hasCodexModels ||
              hasClaudeModels ||
              hasCopilotModels ||
              grouped.length > 0) && (
              <DisclosureGroup
                allowsMultipleExpanded
                expandedKeys={expandedProviders}
                onExpandedChange={setExpandedProviders}
              >
                <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
                  {hasCodexModels && (
                    <Disclosure id="runtime-codex">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-3.5 w-3.5"
                              provider="openai"
                            />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
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
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {codexStatus!.availableModels.map((model) => (
                              <div
                                className="flex items-center gap-2.5 py-1.5 pl-9"
                                key={model.id}
                              >
                                <span className="text-foreground shrink-0 text-[13px]">
                                  {model.displayName}
                                </span>
                                {model.isDefault && (
                                  <Chip color="accent" size="sm" variant="soft">
                                    Default
                                  </Chip>
                                )}
                                <span className="text-muted min-w-0 flex-1 truncate text-[11px]">
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
                                </div>
                              </div>
                            ))}
                          </div>
                        </Disclosure.Body>
                      </Disclosure.Content>
                    </Disclosure>
                  )}

                  {hasClaudeModels && (
                    <Disclosure id="runtime-claude">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-3.5 w-3.5"
                              provider="anthropic"
                            />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
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
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {claudeStatus!.availableModels.map((model) => (
                              <div
                                className="flex items-center gap-2.5 py-1.5 pl-9"
                                key={model.id}
                              >
                                <span className="text-foreground shrink-0 text-[13px]">
                                  {model.displayName}
                                </span>
                                {model.isDefault && (
                                  <Chip color="accent" size="sm" variant="soft">
                                    Default
                                  </Chip>
                                )}
                                <span className="text-muted min-w-0 flex-1 truncate text-[11px]">
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

                  {hasCopilotModels && (
                    <Disclosure id="runtime-copilot">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <CopilotIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
                            Copilot Models
                          </span>
                          <Chip size="sm" variant="soft">
                            {copilotStatus!.availableModels.length}
                          </Chip>
                          <Disclosure.Indicator className="ml-auto" />
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {copilotStatus!.availableModels.map((model) => (
                              <div
                                className="flex items-center gap-2.5 py-1.5 pl-9"
                                key={model.id}
                              >
                                <span className="text-foreground shrink-0 text-[13px]">
                                  {model.displayName}
                                </span>
                                {model.isDefault && (
                                  <Chip color="accent" size="sm" variant="soft">
                                    Default
                                  </Chip>
                                )}
                                <span className="text-muted min-w-0 flex-1 truncate text-[11px]">
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

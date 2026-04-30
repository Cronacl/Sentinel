"use client";

import {
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  Spinner,
} from "@heroui/react";
import { type ReactNode, useCallback, useState } from "react";
import { sileo } from "sileo";

import {
  isUnstableChatEngine,
  UNSTABLE_CHAT_ENGINE_DESCRIPTION,
  UNSTABLE_CHAT_ENGINE_LABEL,
} from "@/components/chat/chat-composer-helpers";
import { CopilotIcon } from "@/components/icons/copilot-icon";
import { OpenCodeIcon } from "@/components/icons/open-target-icons";
import { ProviderIcon } from "@/components/icons/provider-icon";
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
  getCursorRuntimeBadgeColor,
  getCursorRuntimeBadgeLabel,
  getCursorRuntimeCliLabel,
  getCursorRuntimeFallbackMessage,
  getOpenCodeRuntimeBadgeColor,
  getOpenCodeRuntimeBadgeLabel,
  getOpenCodeRuntimeCliLabel,
  getOpenCodeRuntimeFallbackMessage,
} from "@/components/settings/runtime-status";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { api } from "@/trpc/react";

type RuntimeEngineKey = "claude" | "codex" | "copilot" | "cursor" | "opencode";

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
  stabilityDescription,
  stabilityLabel,
  fallbackMessage,
  engineError,
  isRefreshing,
  onRefresh,
}: {
  title: string;
  badge: string;
  badgeColor: "success" | "warning" | "danger" | "default";
  rows: { label: string; value: ReactNode }[];
  stabilityDescription?: string;
  stabilityLabel?: string;
  fallbackMessage: string | null;
  engineError: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="border-separator/20 rounded-2xl border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-foreground truncate text-[13px] font-medium">
            {title}
          </span>
          {stabilityLabel ? (
            <Chip
              aria-label={stabilityDescription}
              color="warning"
              size="sm"
              variant="soft"
            >
              {stabilityLabel}
            </Chip>
          ) : null}
        </div>
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

export default function EnginesPage() {
  const enginesQuery = api.engines.list.useQuery();
  const refreshRuntimeStatus = api.engines.refreshStatus.useMutation();
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
  const cursorEngine = enginesQuery.data?.find(
    (engine) => engine.engine === "cursor",
  );
  const cursorStatus =
    cursorEngine?.engine === "cursor" && "status" in cursorEngine
      ? cursorEngine.status
      : null;
  const openCodeEngine = enginesQuery.data?.find(
    (engine) => engine.engine === "opencode",
  );
  const openCodeStatus =
    openCodeEngine?.engine === "opencode" && "status" in openCodeEngine
      ? openCodeEngine.status
      : null;

  const [actionError, setActionError] = useState("");
  const [expandedEngines, setExpandedEngines] = useState<Set<string | number>>(
    new Set(),
  );
  const [pendingRuntimeRefresh, setPendingRuntimeRefresh] =
    useState<RuntimeEngineKey | null>(null);
  const [showCodexAccount, setShowCodexAccount] = useState(false);
  const [showClaudeAccount, setShowClaudeAccount] = useState(false);
  const [showCopilotAccount, setShowCopilotAccount] = useState(false);

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
                  : engine === "cursor"
                    ? "Cursor detection reloaded."
                    : engine === "opencode"
                      ? "OpenCode detection reloaded."
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
  const hasCursorModels =
    cursorStatus?.availableModels && cursorStatus.availableModels.length > 0;
  const hasOpenCodeModels =
    openCodeStatus?.availableModels &&
    openCodeStatus.availableModels.length > 0;
  const isRefreshingCodex = pendingRuntimeRefresh === "codex";
  const isRefreshingClaude = pendingRuntimeRefresh === "claude";
  const isRefreshingCopilot = pendingRuntimeRefresh === "copilot";
  const isRefreshingCursor = pendingRuntimeRefresh === "cursor";
  const isRefreshingOpenCode = pendingRuntimeRefresh === "opencode";
  const codexFallbackMessage = getCodexRuntimeFallbackMessage(codexStatus);
  const claudeFallbackMessage = getClaudeRuntimeFallbackMessage(claudeStatus);
  const copilotFallbackMessage =
    getCopilotRuntimeFallbackMessage(copilotStatus);
  const cursorFallbackMessage = getCursorRuntimeFallbackMessage(cursorStatus);
  const openCodeFallbackMessage =
    getOpenCodeRuntimeFallbackMessage(openCodeStatus);

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
      subtitle="Inspect local coding engines, detected runtimes, and engine-specific model options."
      title="Engines"
    >
      {enginesQuery.isPending && !enginesQuery.data ? (
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
                title="Cursor Agent Runtime"
                badge={getCursorRuntimeBadgeLabel(
                  cursorStatus,
                  cursorEngine?.isAvailable ?? false,
                )}
                badgeColor={getCursorRuntimeBadgeColor(
                  cursorStatus,
                  cursorEngine?.isAvailable ?? false,
                )}
                rows={[
                  {
                    label: "CLI",
                    value: getCursorRuntimeCliLabel(cursorStatus),
                  },
                  {
                    label: "Auth",
                    value: cursorStatus?.authReady ? "Ready" : "Unavailable",
                  },
                  {
                    label: "Models",
                    value: `${cursorStatus?.availableModels.length ?? 0} available`,
                  },
                  {
                    label: "Mode picker",
                    value: cursorStatus?.parameterizedModelPicker
                      ? "Parameterized"
                      : "Basic",
                  },
                ]}
                fallbackMessage={cursorFallbackMessage}
                engineError={
                  !cursorFallbackMessage &&
                  !cursorEngine?.isAvailable &&
                  cursorEngine?.error
                    ? cursorEngine.error
                    : null
                }
                stabilityDescription={
                  isUnstableChatEngine("cursor")
                    ? UNSTABLE_CHAT_ENGINE_DESCRIPTION
                    : undefined
                }
                stabilityLabel={
                  isUnstableChatEngine("cursor")
                    ? UNSTABLE_CHAT_ENGINE_LABEL
                    : undefined
                }
                isRefreshing={isRefreshingCursor}
                onRefresh={() => void handleRefreshRuntime("cursor")}
              />
              <RuntimeCard
                title="OpenCode Runtime"
                badge={getOpenCodeRuntimeBadgeLabel(
                  openCodeStatus,
                  openCodeEngine?.isAvailable ?? false,
                )}
                badgeColor={getOpenCodeRuntimeBadgeColor(
                  openCodeStatus,
                  openCodeEngine?.isAvailable ?? false,
                )}
                rows={[
                  {
                    label: "CLI",
                    value: getOpenCodeRuntimeCliLabel(openCodeStatus),
                  },
                  {
                    label: "Auth",
                    value: openCodeStatus?.authReady ? "Ready" : "Unavailable",
                  },
                  {
                    label: "Models",
                    value: `${openCodeStatus?.availableModels.length ?? 0} available`,
                  },
                  {
                    label: "Agents",
                    value: `${openCodeStatus?.availableModels[0]?.openCode.agentOptions.length ?? 0} available`,
                  },
                ]}
                fallbackMessage={openCodeFallbackMessage}
                engineError={
                  !openCodeFallbackMessage &&
                  !openCodeEngine?.isAvailable &&
                  openCodeEngine?.error
                    ? openCodeEngine.error
                    : null
                }
                stabilityDescription={
                  isUnstableChatEngine("opencode")
                    ? UNSTABLE_CHAT_ENGINE_DESCRIPTION
                    : undefined
                }
                stabilityLabel={
                  isUnstableChatEngine("opencode")
                    ? UNSTABLE_CHAT_ENGINE_LABEL
                    : undefined
                }
                isRefreshing={isRefreshingOpenCode}
                onRefresh={() => void handleRefreshRuntime("opencode")}
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
              hasCursorModels ||
              hasOpenCodeModels) && (
              <DisclosureGroup
                allowsMultipleExpanded
                expandedKeys={expandedEngines}
                onExpandedChange={setExpandedEngines}
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

                  {hasCursorModels && (
                    <Disclosure id="runtime-cursor">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <ProviderIcon
                              className="h-3.5 w-3.5"
                              provider="openai"
                            />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
                            Cursor Models
                          </span>
                          <Chip size="sm" variant="soft">
                            {cursorStatus!.availableModels.length}
                          </Chip>
                          <Disclosure.Indicator className="ml-auto" />
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {cursorStatus!.availableModels.map((model) => (
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
                                  {model.defaultReasoningEffort && (
                                    <Chip size="sm" variant="soft">
                                      {model.defaultReasoningEffort}
                                    </Chip>
                                  )}
                                  {model.supportedReasoningEfforts.length >
                                    0 && (
                                    <Chip size="sm" variant="soft">
                                      {model.supportedReasoningEfforts.length}{" "}
                                      efforts
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

                  {hasOpenCodeModels && (
                    <Disclosure id="runtime-opencode">
                      <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                            <OpenCodeIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-foreground text-[13px] font-medium">
                            OpenCode Models
                          </span>
                          <Chip size="sm" variant="soft">
                            {openCodeStatus!.availableModels.length}
                          </Chip>
                          <Disclosure.Indicator className="ml-auto" />
                        </Disclosure.Trigger>
                      </Disclosure.Heading>
                      <Disclosure.Content>
                        <Disclosure.Body>
                          <div className="divide-separator/10 divide-y px-3 pb-2">
                            {openCodeStatus!.availableModels.map((model) => (
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
                                  {model.openCode.agentOptions.length > 0 && (
                                    <Chip size="sm" variant="soft">
                                      {model.openCode.agentOptions.length}{" "}
                                      agents
                                    </Chip>
                                  )}
                                  {model.openCode.variantOptions.length > 0 && (
                                    <Chip size="sm" variant="soft">
                                      {model.openCode.variantOptions.length}{" "}
                                      variants
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
                </div>
              </DisclosureGroup>
            )}
          </div>
        </>
      )}
    </SettingsPageWrapper>
  );
}

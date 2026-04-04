"use client";

import { Button, Chip, Spinner, Switch } from "@heroui/react";
import { useEffect, useState } from "react";
import { sileo } from "sileo";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import {
  IntegrationConfigDrawer,
  type IntegrationSummary,
} from "@/components/settings/integration-config-sidebar";
import {
  DatabaseConfigDrawer,
  type DatabaseIntegrationSummary,
} from "@/components/settings/database-config-sidebar";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  INTEGRATION_METADATA,
  isIntegrationSetupReady,
} from "@/lib/integrations/metadata";
import { openIntegrationOAuthPopup } from "@/lib/integrations/oauth/popup";
import {
  AUTHLESS_INTEGRATION_PROVIDERS,
  DATABASE_INTEGRATION_PROVIDERS,
  type AuthlessIntegrationProvider,
  type DatabaseIntegrationProvider,
  type IntegrationProvider,
} from "@/server/db/enums";
import { api } from "@/trpc/react";

function isDatabaseProvider(
  provider: string,
): provider is DatabaseIntegrationProvider {
  return (DATABASE_INTEGRATION_PROVIDERS as readonly string[]).includes(
    provider,
  );
}

function isAuthlessProvider(
  provider: string,
): provider is AuthlessIntegrationProvider {
  return (AUTHLESS_INTEGRATION_PROVIDERS as readonly string[]).includes(
    provider,
  );
}

type IntegrationListItem = {
  hasDbConfig?: boolean;
  hasOAuthApp: boolean;
  id: string | null;
  isConnected: boolean;
  isEnabled: boolean;
  label: string;
  provider: IntegrationProvider;
};

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

function IntegrationCell({
  connectingProvider,
  integration,
  isAuthlessToggling,
  isSelected,
  isToggling,
  onAuthlessToggle,
  onConnect,
  onManage,
  onToggle,
}: {
  connectingProvider: IntegrationProvider | null;
  integration: IntegrationListItem;
  isAuthlessToggling: boolean;
  isSelected: boolean;
  isToggling: boolean;
  onAuthlessToggle: (provider: IntegrationProvider, enable: boolean) => void;
  onConnect: (provider: IntegrationProvider) => void;
  onManage: (provider: IntegrationProvider) => void;
  onToggle: (provider: IntegrationProvider, isEnabled: boolean) => void;
}) {
  const metadata = INTEGRATION_METADATA[integration.provider];
  const isSetupReady = isIntegrationSetupReady(integration.provider);
  const isDb = isDatabaseProvider(integration.provider);
  const isAuthless = isAuthlessProvider(integration.provider);
  const canManage = !isAuthless && (integration.isConnected || isSetupReady);
  const isConnecting = connectingProvider === integration.provider;
  const showConnectButton =
    !isDb &&
    !isAuthless &&
    !integration.isConnected &&
    isSetupReady &&
    integration.hasOAuthApp;

  return (
    <div
      className={`border-separator/20 flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 transition-colors ${
        isSelected
          ? "border-primary/50 bg-primary/[0.03]"
          : "bg-surface hover:bg-surface-hover"
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background">
        <IntegrationProviderIcon
          className="h-4 w-4"
          provider={integration.provider}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[13px] font-medium leading-tight">
            {integration.label}
          </span>
          {integration.isConnected ? (
            <Chip
              color={integration.isEnabled ? "success" : "warning"}
              size="sm"
              variant="soft"
            >
              {integration.isEnabled ? "Active" : "Paused"}
            </Chip>
          ) : integration.hasOAuthApp ? (
            <Chip color="warning" size="sm" variant="soft">
              Credentials saved
            </Chip>
          ) : !isSetupReady ? (
            <Chip size="sm" variant="soft">
              Coming soon
            </Chip>
          ) : isAuthless ? (
            <Chip size="sm" variant="soft">
              No setup needed
            </Chip>
          ) : null}
        </div>
        <p className="text-muted mt-0.5 truncate text-[11px]">
          {metadata.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isAuthless ? (
          <Switch
            aria-label={`Enable ${integration.label}`}
            isDisabled={isAuthlessToggling}
            isSelected={integration.isConnected && integration.isEnabled}
            onChange={() =>
              onAuthlessToggle(
                integration.provider,
                !(integration.isConnected && integration.isEnabled),
              )
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        ) : (
          <>
            {integration.isConnected ? (
              <Switch
                aria-label={`Enable ${integration.label}`}
                isDisabled={isToggling}
                isSelected={integration.isEnabled}
                onChange={() =>
                  onToggle(integration.provider, !integration.isEnabled)
                }
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            ) : null}

            {showConnectButton ? (
              <Button
                isPending={isConnecting}
                onPress={() => onConnect(integration.provider)}
                size="sm"
                variant="primary"
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                Connect
              </Button>
            ) : null}

            {canManage ? (
              <Button
                onPress={() => onManage(integration.provider)}
                size="sm"
                variant={isSelected ? "primary" : "secondary"}
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                {integration.isConnected ? "Details" : "Setup"}
              </Button>
            ) : !isSetupReady ? null : (
              <Button
                isDisabled
                size="sm"
                variant="secondary"
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                Coming soon
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const [selectedProvider, setSelectedProvider] =
    useState<IntegrationProvider | null>(null);
  const [connectingProvider, setConnectingProvider] =
    useState<IntegrationProvider | null>(null);

  const integrationsQuery = api.integrations.list.useQuery();
  const utils = api.useUtils();
  const connect = api.integrations.connect.useMutation();

  const enableAuthless = api.integrations.enableAuthless.useMutation({
    onSettled: async () => {
      await utils.integrations.list.invalidate();
    },
  });

  const disableAuthless = api.integrations.disableAuthless.useMutation({
    onSettled: async () => {
      await utils.integrations.list.invalidate();
    },
  });

  const toggle = api.integrations.toggle.useMutation({
    onMutate: async ({ isEnabled, provider }) => {
      const previousIntegrations = utils.integrations.list.getData();

      utils.integrations.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.provider === provider ? { ...item, isEnabled } : item,
        ),
      );

      return { previousIntegrations };
    },
    onError: (error, _variables, context) => {
      utils.integrations.list.setData(
        undefined,
        context?.previousIntegrations ?? [],
      );
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update integration.",
      });
    },
    onSettled: async () => {
      await utils.integrations.list.invalidate();
    },
  });

  const integrations = integrationsQuery.data ?? [];

  const authless = integrations.filter((integration) =>
    isAuthlessProvider(integration.provider),
  );
  const connected = integrations
    .filter(
      (integration) =>
        integration.isConnected && !isAuthlessProvider(integration.provider),
    )
    .sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled));
  const readyToSetup = integrations
    .filter(
      (integration) =>
        !integration.isConnected &&
        !isAuthlessProvider(integration.provider) &&
        isIntegrationSetupReady(integration.provider),
    )
    .sort(
      (left, right) => Number(right.hasOAuthApp) - Number(left.hasOAuthApp),
    );
  const comingSoon = integrations.filter(
    (integration) =>
      !integration.isConnected &&
      !isAuthlessProvider(integration.provider) &&
      !isIntegrationSetupReady(integration.provider),
  );
  const selectedIntegration =
    selectedProvider === null
      ? null
      : (integrations.find((item) => item.provider === selectedProvider) ??
        null);
  const isDetailsOpen = selectedIntegration !== null;
  const isDbDrawer =
    selectedIntegration !== null &&
    isDatabaseProvider(selectedIntegration.provider);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncIntegrations = () => {
      setConnectingProvider(null);
      void integrationsQuery.refetch();
      void utils.integrations.list.invalidate();
    };

    const channel = new BroadcastChannel("sentinel-integration-oauth");
    const onChannelMessage = (event: MessageEvent<{ success?: boolean }>) => {
      if (!event.data?.success) {
        return;
      }

      syncIntegrations();
    };
    const onWindowMessage = (
      event: MessageEvent<{ success?: boolean; type?: string }>,
    ) => {
      if (
        !event.data?.success ||
        event.data.type !== "integration-oauth-complete"
      ) {
        return;
      }

      syncIntegrations();
    };

    channel.addEventListener("message", onChannelMessage);
    window.addEventListener("message", onWindowMessage);

    return () => {
      channel.removeEventListener("message", onChannelMessage);
      channel.close();
      window.removeEventListener("message", onWindowMessage);
    };
  }, [integrationsQuery, utils.integrations.list]);

  const handleConnect = async (provider: IntegrationProvider) => {
    setConnectingProvider(provider);

    try {
      const { authorizationUrl } = await connect.mutateAsync({ provider });

      await openIntegrationOAuthPopup(authorizationUrl, () => {
        void utils.integrations.list.invalidate();
      });

      await utils.integrations.list.invalidate();
    } catch (error) {
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect integration.",
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleAuthlessToggle = (
    provider: IntegrationProvider,
    enable: boolean,
  ) => {
    if (!isAuthlessProvider(provider)) return;
    if (enable) {
      enableAuthless.mutate({ provider });
    } else {
      disableAuthless.mutate({ provider });
    }
  };

  const renderCells = (items: IntegrationListItem[], isToggling: boolean) =>
    items.map((integration) => (
      <IntegrationCell
        connectingProvider={connectingProvider}
        integration={integration}
        isAuthlessToggling={
          enableAuthless.isPending || disableAuthless.isPending
        }
        isSelected={selectedProvider === integration.provider}
        isToggling={isToggling}
        key={integration.provider}
        onAuthlessToggle={handleAuthlessToggle}
        onConnect={handleConnect}
        onManage={setSelectedProvider}
        onToggle={(provider, isEnabled) =>
          toggle.mutate({ isEnabled, provider })
        }
      />
    ));

  return (
    <SettingsPageWrapper
      subtitle="Connect external tools Sentinel can act on directly using your own credentials."
      title="Integrations"
    >
      <>
        {integrationsQuery.isPending && integrations.length === 0 ? (
          <SettingsLoadingSpinner />
        ) : (
          <div className="flex flex-col gap-3">
            {connected.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <div className="px-1.5 pb-0.5">
                  <h2 className="text-foreground text-sm font-medium">
                    Connected
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {renderCells(connected, toggle.isPending)}
                </div>
              </section>
            ) : null}

            {authless.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <div className="px-1.5 pb-0.5">
                  <h2 className="text-foreground text-sm font-medium">
                    Public Data Sources
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {renderCells(authless, false)}
                </div>
              </section>
            ) : null}

            {readyToSetup.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <div className="px-1.5 pb-0.5">
                  <h2 className="text-foreground text-sm font-medium">
                    Ready To Set Up
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {renderCells(readyToSetup, false)}
                </div>
              </section>
            ) : null}

            {comingSoon.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <div className="px-1.5 pb-0.5">
                  <h2 className="text-foreground text-sm font-medium">
                    Coming Soon
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {renderCells(comingSoon, false)}
                </div>
              </section>
            ) : null}
          </div>
        )}
        {isDbDrawer ? (
          <DatabaseConfigDrawer
            integration={selectedIntegration as DatabaseIntegrationSummary}
            isOpen={isDetailsOpen}
            onOpenChange={(open) => {
              if (!open) setSelectedProvider(null);
            }}
          />
        ) : (
          <IntegrationConfigDrawer
            integration={selectedIntegration as IntegrationSummary | null}
            isOpen={isDetailsOpen}
            onOpenChange={(open) => {
              if (!open) setSelectedProvider(null);
            }}
          />
        )}
      </>
    </SettingsPageWrapper>
  );
}

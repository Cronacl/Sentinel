"use client";

import { Button, Chip, Skeleton, Switch } from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import {
  IntegrationConfigSidebar,
  type IntegrationSummary,
} from "@/components/settings/integration-config-sidebar";
import {
  DatabaseConfigSidebar,
  type DatabaseIntegrationSummary,
} from "@/components/settings/database-config-sidebar";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { useRightSidebar } from "@/components/shell";
import {
  INTEGRATION_METADATA,
  isIntegrationSetupReady,
} from "@/lib/integrations/metadata";
import { openIntegrationOAuthPopup } from "@/lib/integrations/oauth/popup";
import {
  DATABASE_INTEGRATION_PROVIDERS,
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

type IntegrationListItem = {
  hasDbConfig?: boolean;
  hasOAuthApp: boolean;
  id: string | null;
  isConnected: boolean;
  isEnabled: boolean;
  label: string;
  provider: IntegrationProvider;
};

function IntegrationsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <section
          className="border-separator bg-surface rounded-xl border p-5"
          key={index}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-36 rounded-md" />
              <Skeleton className="h-2 w-72 max-w-full rounded-md" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function IntegrationRow({
  connectingProvider,
  integration,
  isSelected,
  isToggling,
  onConnect,
  onManage,
  onToggle,
}: {
  connectingProvider: IntegrationProvider | null;
  integration: IntegrationListItem;
  isSelected: boolean;
  isToggling: boolean;
  onConnect: (provider: IntegrationProvider) => void;
  onManage: (provider: IntegrationProvider) => void;
  onToggle: (provider: IntegrationProvider, isEnabled: boolean) => void;
}) {
  const metadata = INTEGRATION_METADATA[integration.provider];
  const isSetupReady = isIntegrationSetupReady(integration.provider);
  const isDb = isDatabaseProvider(integration.provider);
  const canManage = integration.isConnected || isSetupReady;
  const isConnecting = connectingProvider === integration.provider;
  const showConnectButton =
    !isDb &&
    !integration.isConnected &&
    isSetupReady &&
    integration.hasOAuthApp;
  const detailLabel = integration.isConnected ? "Details" : "Setup";

  const statusChip = integration.isConnected ? (
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
  ) : null;

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-2.5 transition-colors ${
        isSelected
          ? "border-primary/50 bg-primary/[0.03]"
          : "border-separator bg-surface"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80">
        <IntegrationProviderIcon
          className="h-5 w-5"
          provider={integration.provider}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-medium">
            {integration.label}
          </span>
          {statusChip}
        </div>
        <p className="text-muted mt-0.5 text-xs">{metadata.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
          >
            Connect
          </Button>
        ) : null}

        <Button
          isDisabled={!canManage}
          onPress={() => onManage(integration.provider)}
          size="sm"
          variant={
            isSelected
              ? "primary"
              : showConnectButton || integration.isConnected
                ? "secondary"
                : "primary"
          }
        >
          {canManage ? detailLabel : "Coming soon"}
        </Button>
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const [selectedProvider, setSelectedProvider] =
    useState<IntegrationProvider | null>(null);
  const [connectingProvider, setConnectingProvider] =
    useState<IntegrationProvider | null>(null);
  const previousRightSidebarOpenRef = useRef(false);

  const integrationsQuery = api.integrations.list.useQuery();
  const utils = api.useUtils();
  const connect = api.integrations.connect.useMutation();
  const { close, isOpen, open } = useRightSidebar();

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
  const connected = integrations
    .filter((integration) => integration.isConnected)
    .sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled));
  const readyToSetup = integrations
    .filter(
      (integration) =>
        !integration.isConnected &&
        isIntegrationSetupReady(integration.provider),
    )
    .sort(
      (left, right) => Number(right.hasOAuthApp) - Number(left.hasOAuthApp),
    );
  const comingSoon = integrations.filter(
    (integration) =>
      !integration.isConnected &&
      !isIntegrationSetupReady(integration.provider),
  );
  const selectedIntegration =
    selectedProvider === null
      ? null
      : (integrations.find((item) => item.provider === selectedProvider) ??
        null);

  const sidebarContent = useMemo(() => {
    if (!selectedIntegration) {
      return null;
    }

    if (isDatabaseProvider(selectedIntegration.provider)) {
      return (
        <DatabaseConfigSidebar
          integration={selectedIntegration as DatabaseIntegrationSummary}
          onClose={() => setSelectedProvider(null)}
        />
      );
    }

    return (
      <IntegrationConfigSidebar
        integration={selectedIntegration as IntegrationSummary}
        onClose={() => setSelectedProvider(null)}
      />
    );
  }, [selectedIntegration]);

  useEffect(() => {
    if (
      previousRightSidebarOpenRef.current &&
      !isOpen &&
      selectedProvider !== null
    ) {
      setSelectedProvider(null);
    }

    previousRightSidebarOpenRef.current = isOpen;
  }, [isOpen, selectedProvider]);

  useEffect(() => {
    if (!sidebarContent) {
      close();
      return;
    }

    open(sidebarContent);
  }, [close, open, sidebarContent]);

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

  const renderRows = (items: IntegrationListItem[], isToggling: boolean) =>
    items.map((integration) => (
      <IntegrationRow
        connectingProvider={connectingProvider}
        integration={integration}
        isSelected={selectedProvider === integration.provider}
        isToggling={isToggling}
        key={integration.provider}
        onConnect={handleConnect}
        onManage={setSelectedProvider}
        onToggle={(provider, isEnabled) =>
          toggle.mutate({ isEnabled, provider })
        }
      />
    ));

  return (
    <SettingsPageWrapper
      subtitle="Connect the external tools Sentinel can act on directly. Setup stays local, and each integration uses your own credentials."
      title="Integrations"
    >
      {integrationsQuery.isPending && integrations.length === 0 ? (
        <IntegrationsSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          {connected.length > 0 ? (
            <section>
              <h2 className="text-foreground mb-2 px-1 text-sm font-medium">
                Connected
              </h2>
              <div className="flex flex-col gap-2">
                {renderRows(connected, toggle.isPending)}
              </div>
            </section>
          ) : null}

          {readyToSetup.length > 0 ? (
            <section>
              <h2 className="text-foreground mb-2 px-1 text-sm font-medium">
                Ready To Set Up
              </h2>
              <div className="flex flex-col gap-2">
                {renderRows(readyToSetup, false)}
              </div>
            </section>
          ) : null}

          {comingSoon.length > 0 ? (
            <section>
              <div className="mb-2 px-1">
                <h2 className="text-foreground text-sm font-medium">
                  Coming Soon
                </h2>
                <p className="text-muted mt-0.5 text-xs">
                  These integrations are planned, but the connection flow is not
                  available yet.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {renderRows(comingSoon, false)}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </SettingsPageWrapper>
  );
}

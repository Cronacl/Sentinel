"use client";

import { Button, Chip, Skeleton, Switch } from "@heroui/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import {
  IntegrationConfigSidebar,
  type IntegrationSummary,
} from "@/components/settings/integration-config-sidebar";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { useRightSidebar } from "@/components/shell";
import {
  INTEGRATION_METADATA,
  isIntegrationSetupReady,
} from "@/lib/integrations/metadata";
import { openIntegrationOAuthPopup } from "@/lib/integrations/oauth/popup";
import type { IntegrationProvider } from "@/server/db/enums";
import { api } from "@/trpc/react";

type IntegrationListItem = {
  hasOAuthApp: boolean;
  id: string | null;
  isConnected: boolean;
  isEnabled: boolean;
  label: string;
  provider: IntegrationProvider;
};

function getGridColumns(width: number, isSidebarOpen: boolean) {
  if (isSidebarOpen) {
    return 1;
  }

  if (width >= 1000) {
    return 3;
  }

  return 1;
}

function IntegrationSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <section
          className="border-separator bg-surface rounded-2xl border p-4"
          key={index}
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Skeleton className="h-8 w-24 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </section>
      ))}
    </div>
  );
}

function IntegrationGrid({
  children,
  columns,
}: {
  children: ReactNode;
  columns: number;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  description = "",
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <div className="mb-2 px-1">
      <h2 className="text-foreground text-sm font-medium">{title}</h2>
      <p className="text-muted mt-1 text-xs">{description}</p>
    </div>
  );
}

function IntegrationCard({
  connectingProvider,
  integration,
  isToggling,
  onConnect,
  onManage,
  onToggle,
}: {
  connectingProvider: IntegrationProvider | null;
  integration: IntegrationListItem;
  isToggling: boolean;
  onConnect: (provider: IntegrationProvider) => void;
  onManage: (provider: IntegrationProvider) => void;
  onToggle: (provider: IntegrationProvider, isEnabled: boolean) => void;
}) {
  const metadata = INTEGRATION_METADATA[integration.provider];
  const isSetupReady = isIntegrationSetupReady(integration.provider);
  const canManage = integration.isConnected || isSetupReady;
  const isConnecting = connectingProvider === integration.provider;
  const showConnectButton =
    !integration.isConnected && isSetupReady && integration.hasOAuthApp;
  const detailLabel = integration.isConnected ? "Details" : "Setup";
  const statusText = integration.isConnected
    ? integration.isEnabled
      ? "Connected and active"
      : "Connected and paused"
    : integration.hasOAuthApp
      ? "Credentials saved"
      : isSetupReady
        ? "Ready to configure"
        : "Not available yet";

  return (
    <section className="border-separator bg-surface rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-background/80">
          <IntegrationProviderIcon
            className="h-6 w-6"
            provider={integration.provider}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-foreground text-base font-medium">
              {integration.label}
            </h3>
            {integration.isConnected ? (
              <Chip color="success" size="sm" variant="soft">
                Connected
              </Chip>
            ) : integration.hasOAuthApp ? (
              <Chip color="warning" size="sm" variant="soft">
                Credentials saved
              </Chip>
            ) : null}
            {!isSetupReady && !integration.isConnected ? (
              <Chip size="sm" variant="soft">
                Coming soon
              </Chip>
            ) : null}
            {integration.isConnected ? (
              <Chip
                color={integration.isEnabled ? "success" : "warning"}
                size="sm"
                variant="soft"
              >
                {integration.isEnabled ? "Active" : "Paused"}
              </Chip>
            ) : null}
          </div>

          <p className="text-muted mt-1 text-sm">{metadata.description}</p>
          <p className="text-muted mt-2 text-xs">{statusText}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
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
              showConnectButton || integration.isConnected
                ? "secondary"
                : "primary"
            }
          >
            {canManage ? detailLabel : "Coming soon"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function IntegrationsSettingsPage() {
  const [selectedProvider, setSelectedProvider] =
    useState<IntegrationProvider | null>(null);
  const [connectingProvider, setConnectingProvider] =
    useState<IntegrationProvider | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const integrationsQuery = api.integrations.list.useQuery();
  const utils = api.useUtils();
  const connect = api.integrations.connect.useMutation();
  const rightSidebar = useRightSidebar();

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
    onError: (_error, _variables, context) => {
      utils.integrations.list.setData(
        undefined,
        context?.previousIntegrations ?? [],
      );
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

    return (
      <IntegrationConfigSidebar
        integration={selectedIntegration as IntegrationSummary}
        onClose={() => setSelectedProvider(null)}
      />
    );
  }, [selectedIntegration]);

  useEffect(() => {
    if (!sidebarContent) {
      if (rightSidebar.isOpen) {
        rightSidebar.close();
      }
      return;
    }

    if (rightSidebar.isOpen) {
      rightSidebar.setContent(sidebarContent);
      return;
    }

    rightSidebar.open(sidebarContent);
  }, [rightSidebar, sidebarContent]);

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

  useEffect(() => {
    const element = pageRef.current;
    if (!element) {
      return;
    }

    const updateColumns = () => {
      setGridColumns(getGridColumns(element.clientWidth, rightSidebar.isOpen));
    };

    updateColumns();

    const observer = new ResizeObserver(() => {
      updateColumns();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rightSidebar.isOpen]);

  const handleConnect = async (provider: IntegrationProvider) => {
    setConnectingProvider(provider);

    try {
      const { authorizationUrl } = await connect.mutateAsync({ provider });

      await openIntegrationOAuthPopup(authorizationUrl, () => {
        void utils.integrations.list.invalidate();
      });

      await utils.integrations.list.invalidate();
    } finally {
      setConnectingProvider(null);
    }
  };

  return (
    <SettingsPageWrapper
      contentClassName="max-w-6xl"
      subtitle="Connect the external tools Sentinel can act on directly. Setup stays local, and each integration uses your own credentials."
      title="Integrations"
    >
      {integrationsQuery.isPending && integrations.length === 0 ? (
        <IntegrationSkeleton />
      ) : (
        <div className="flex flex-col gap-5" ref={pageRef}>
          {connected.length > 0 ? (
            <section>
              <SectionHeading title="Connected" />
              <IntegrationGrid columns={gridColumns}>
                {connected.map((integration) => (
                  <IntegrationCard
                    connectingProvider={connectingProvider}
                    integration={integration}
                    isToggling={toggle.isPending}
                    key={integration.provider}
                    onConnect={handleConnect}
                    onManage={setSelectedProvider}
                    onToggle={(provider, isEnabled) =>
                      toggle.mutate({ isEnabled, provider })
                    }
                  />
                ))}
              </IntegrationGrid>
            </section>
          ) : null}

          {readyToSetup.length > 0 ? (
            <section>
              <SectionHeading title="Ready To Set Up" />
              <IntegrationGrid columns={gridColumns}>
                {readyToSetup.map((integration) => (
                  <IntegrationCard
                    connectingProvider={connectingProvider}
                    integration={integration}
                    isToggling={false}
                    key={integration.provider}
                    onConnect={handleConnect}
                    onManage={setSelectedProvider}
                    onToggle={() => undefined}
                  />
                ))}
              </IntegrationGrid>
            </section>
          ) : null}

          {comingSoon.length > 0 ? (
            <section>
              <SectionHeading
                description="These integrations are planned, but the connection flow is not available yet."
                title="Coming Soon"
              />
              <IntegrationGrid columns={gridColumns}>
                {comingSoon.map((integration) => (
                  <IntegrationCard
                    connectingProvider={connectingProvider}
                    integration={integration}
                    isToggling={false}
                    key={integration.provider}
                    onConnect={handleConnect}
                    onManage={setSelectedProvider}
                    onToggle={() => undefined}
                  />
                ))}
              </IntegrationGrid>
            </section>
          ) : null}
        </div>
      )}
    </SettingsPageWrapper>
  );
}

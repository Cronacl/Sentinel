"use client";

import { Button, Chip, Spinner, Switch } from "@heroui/react";
import { useState } from "react";
import { sileo } from "sileo";

import { ProviderIcon } from "@/components/icons/provider-icon";
import { ProviderConfigModal } from "@/components/settings/provider-config-modal";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import type { AIProvider } from "@/server/db/enums";

type ProviderKey = AIProvider;

const STATUS_COLOR = {
  active: "success",
  disabled: "warning",
  not_configured: "default",
} as const;

const STATUS_LABEL = {
  active: "Active",
  disabled: "Disabled",
  not_configured: "Not configured",
} as const;

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

export default function ProvidersPage() {
  const [modalProvider, setModalProvider] = useState<{
    id: ProviderKey;
    name: string;
  } | null>(null);

  const { data: providers, isPending } = api.providers.list.useQuery();
  const utils = api.useUtils();

  const toggle = api.providers.toggle.useMutation({
    onMutate: async ({ isEnabled, provider }) => {
      const previousProviders = utils.providers.list.getData();
      const previousModels = utils.models.list.getData();

      utils.providers.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: isEnabled ? "active" : "disabled",
              }
            : item,
        ),
      );
      utils.models.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.provider === provider
            ? { ...item, isConnected: isEnabled }
            : item,
        ),
      );

      return {
        previousModels,
        previousProviders,
      };
    },
    onError: (error, _variables, context) => {
      utils.providers.list.setData(undefined, context?.previousProviders ?? []);
      utils.models.list.setData(undefined, context?.previousModels ?? []);
      sileo.error({
        description: getErrorMessage(error, "Failed to update provider."),
      });
    },
  });
  const isToggling = toggle.isPending;

  const configured =
    providers?.filter((p) => p.status !== "not_configured") ?? [];
  const unconfigured =
    providers?.filter((p) => p.status === "not_configured") ?? [];

  return (
    <SettingsPageWrapper
      subtitle="Manage your AI provider connections."
      title="Providers"
    >
      {!providers && isPending ? <SettingsLoadingSpinner /> : null}

      {providers ? (
        <div className="flex flex-col gap-3">
          {configured.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <div className="px-1.5 pb-0.5">
                <h2 className="text-foreground text-sm font-medium">
                  Configured
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {configured.map((p) => (
                  <div
                    key={p.id}
                    className="border-separator/20 flex items-center gap-2.5 rounded-2xl border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background">
                      <ProviderIcon className="h-4 w-4" provider={p.id} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground text-[13px] font-medium leading-tight">
                          {p.displayName}
                        </span>
                        <Chip
                          color={STATUS_COLOR[p.status]}
                          size="sm"
                          variant="soft"
                        >
                          {STATUS_LABEL[p.status]}
                        </Chip>
                      </div>
                      <p className="text-muted mt-0.5 truncate text-[11px]">
                        {p.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Switch
                        isDisabled={isToggling}
                        isSelected={p.status === "active"}
                        onChange={() =>
                          toggle.mutate({
                            provider: p.id,
                            isEnabled: p.status !== "active",
                          })
                        }
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                      <Button
                        onPress={() =>
                          setModalProvider({ id: p.id, name: p.displayName })
                        }
                        size="sm"
                        variant="secondary"
                        className="h-7 min-w-0 px-2.5 text-xs"
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {unconfigured.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <div className="px-1.5 pb-0.5">
                <h2 className="text-foreground text-sm font-medium">
                  Available
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {unconfigured.map((p) => (
                  <div
                    key={p.id}
                    className="border-separator/20 flex items-center gap-2.5 rounded-2xl border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background">
                      <ProviderIcon className="h-4 w-4" provider={p.id} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="text-foreground text-[13px] font-medium leading-tight line-clamp-1">
                        {p.displayName}
                      </span>
                      <p className="text-muted mt-0.5 truncate text-[11px]">
                        {p.description}
                      </p>
                    </div>

                    <Button
                      onPress={() =>
                        setModalProvider({ id: p.id, name: p.displayName })
                      }
                      size="sm"
                      variant="primary"
                      className="h-7 min-w-0 shrink-0 px-2.5 text-xs"
                    >
                      Connect
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {modalProvider && (
        <ProviderConfigModal
          isOpen={!!modalProvider}
          onOpenChange={(open) => {
            if (!open) setModalProvider(null);
          }}
          provider={modalProvider.id}
          providerName={modalProvider.name}
        />
      )}
    </SettingsPageWrapper>
  );
}

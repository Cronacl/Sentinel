"use client";

import { Button, Chip, Skeleton, Switch } from "@heroui/react";
import { useState } from "react";

import { ProviderConfigModal } from "@/components/settings/provider-config-modal";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { api } from "@/trpc/react";

type ProviderKey = "openai" | "anthropic" | "google" | "google_vertex";

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

function ProvidersSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
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
    onError: (_error, _variables, context) => {
      utils.providers.list.setData(undefined, context?.previousProviders ?? []);
      utils.models.list.setData(undefined, context?.previousModels ?? []);
    },
  });
  const isToggling = toggle.isPending;

  return (
    <SettingsPageWrapper
      subtitle="Manage your AI provider connections"
      title="Providers"
    >
      {!providers && isPending ? <ProvidersSkeleton /> : null}

      <div className="flex flex-col gap-2">
        {providers?.map((p) => (
          <div
            key={p.id}
            className="border-separator bg-surface flex items-center gap-4 rounded-xl border px-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-medium">
                  {p.displayName}
                </span>
                <Chip color={STATUS_COLOR[p.status]} size="sm" variant="soft">
                  {STATUS_LABEL[p.status]}
                </Chip>
              </div>
              <p className="text-muted mt-0.5 text-xs">{p.description}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {p.status !== "not_configured" && (
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
              )}
              <Button
                onPress={() =>
                  setModalProvider({ id: p.id, name: p.displayName })
                }
                size="sm"
                variant={
                  p.status === "not_configured" ? "primary" : "secondary"
                }
              >
                {p.status === "not_configured" ? "Connect" : "Edit"}
              </Button>
            </div>
          </div>
        ))}
      </div>

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

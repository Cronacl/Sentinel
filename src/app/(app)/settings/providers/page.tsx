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

export default function ProvidersPage() {
  const [modalProvider, setModalProvider] = useState<{
    id: ProviderKey;
    name: string;
  } | null>(null);

  const { data: providers, isLoading } = api.providers.list.useQuery();
  const utils = api.useUtils();

  const toggle = api.providers.toggle.useMutation({
    onSuccess: () => void utils.providers.list.invalidate(),
  });
  const isToggling = toggle.isPending;

  return (
    <SettingsPageWrapper
      subtitle="Manage your AI provider connections"
      title="Providers"
    >
      <div className="flex flex-col gap-2">
        {isLoading && (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="border-separator flex items-center gap-4 rounded-xl border px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-3 w-56 rounded-md" />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Skeleton className="h-6 w-10 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </>
        )}

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

"use client";

import { Button, Chip, Form, Skeleton, Spinner, Switch } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { GlobalSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledNumberField,
  ControlledSelectField,
} from "@/components/forms/controlled-fields";
import { SearchProviderConfigModal } from "@/components/settings/search-provider-config-modal";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  DEFAULT_SEARCH_MAX_RESULT_COUNT,
  DEFAULT_SEARCH_PROVIDER,
  DEFAULT_SEARCH_RESULT_COUNT,
  MAX_SEARCH_RESULT_COUNT,
  MIN_SEARCH_RESULT_COUNT,
} from "@/lib/search";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import {
  type SearchSettingsFormValues,
  searchSettingsFormSchema,
} from "@/schemas/search-settings.schema";
import { api } from "@/trpc/react";

type SearchProviderKey = "exa" | "searxng";

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

function SearchSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </section>

      <section className="border-separator bg-surface rounded-xl border">
        {Array.from({ length: 1 }).map((_, index) => (
          <div className="flex items-center gap-4 px-4 py-3" key={index}>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-56 rounded-md" />
            </div>
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-xl" />
          </div>
        ))}
      </section>
    </div>
  );
}

export default function SearchSettingsPage() {
  const utils = api.useUtils();
  const [modalProvider, setModalProvider] = useState<{
    id: SearchProviderKey;
    name: string;
  } | null>(null);
  const [settingsError, setSettingsError] = useState("");

  const searchSettings = api.searchSettings.get.useQuery();
  const searchProviders = api.searchProviders.list.useQuery();

  const form = useForm<SearchSettingsFormValues>({
    defaultValues: {
      defaultProvider: DEFAULT_SEARCH_PROVIDER,
      defaultResultCount: DEFAULT_SEARCH_RESULT_COUNT,
      maxResultCount: DEFAULT_SEARCH_MAX_RESULT_COUNT,
    },
    resolver: zodResolver(searchSettingsFormSchema),
  });

  useEffect(() => {
    if (!searchSettings.data) {
      return;
    }

    form.reset(searchSettings.data);
  }, [form, searchSettings.data]);

  const updateSearchSettings = api.searchSettings.update.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (_current, values: SearchSettingsFormValues) =>
        values,
      getData: () => utils.searchSettings.get.getData(),
      onError: (error) => {
        setSettingsError(error.message);
      },
      onSuccess: (data) => {
        setSettingsError("");
        utils.searchSettings.get.setData(undefined, data);
        form.reset(data);
        sileo.success({ description: "Search settings saved." });
      },
      setData: (value) => {
        utils.searchSettings.get.setData(undefined, value);
      },
    }),
  );

  const toggleProvider = api.searchProviders.toggle.useMutation({
    onMutate: async ({ isEnabled, provider }) => {
      const previousProviders = utils.searchProviders.list.getData();
      const previousProvider = utils.searchProviders.get.getData({ provider });

      utils.searchProviders.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: isEnabled ? "active" : "disabled",
              }
            : item,
        ),
      );
      utils.searchProviders.get.setData({ provider }, (current) =>
        current ? { ...current, isEnabled } : current,
      );

      return { previousProvider, previousProviders };
    },
    onError: (error, variables, context) => {
      utils.searchProviders.list.setData(
        undefined,
        context?.previousProviders ?? [],
      );
      utils.searchProviders.get.setData(
        { provider: variables.provider },
        context?.previousProvider ?? null,
      );
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to toggle search provider.",
      });
    },
  });

  const handleSubmit = async (values: SearchSettingsFormValues) => {
    setSettingsError("");

    try {
      await updateSearchSettings.mutateAsync(values);
    } catch {
      // mutation state handles surfacing errors
    }
  };

  const providersPending = searchProviders.isPending && !searchProviders.data;
  const settingsPending = searchSettings.isPending && !searchSettings.data;

  return (
    <SettingsPageWrapper
      subtitle="Manage web search defaults, result limits, and external search providers."
      title="Search"
    >
      {searchSettings.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {searchSettings.error.message}
        </p>
      ) : null}

      {searchProviders.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {searchProviders.error.message}
        </p>
      ) : null}

      {settingsError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {settingsError}
        </p>
      ) : null}

      {settingsPending || providersPending ? (
        <SearchSettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <Form onSubmit={form.handleSubmit(handleSubmit)}>
            <section className="border-separator bg-surface rounded-xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Search defaults
                </h2>
                <p className="text-muted text-sm">
                  Configure the default provider and how many results the
                  assistant can request in one web search.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledSelectField
                  control={form.control}
                  description="The default provider used when the tool does not explicitly choose one."
                  label="Default provider"
                  name="defaultProvider"
                  options={
                    searchProviders.data?.map((provider) => ({
                      label: provider.displayName,
                      value: provider.id,
                    })) ?? []
                  }
                  selectProps={{ isDisabled: updateSearchSettings.isPending }}
                />

                <ControlledNumberField
                  control={form.control}
                  description="Default number of results returned by one websearch call."
                  inputProps={{ className: "w-full" }}
                  label="Default result count"
                  name="defaultResultCount"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: updateSearchSettings.isPending,
                    maxValue: MAX_SEARCH_RESULT_COUNT,
                    minValue: MIN_SEARCH_RESULT_COUNT,
                  }}
                />

                <ControlledNumberField
                  control={form.control}
                  description="Hard cap enforced server-side even when the tool requests more results."
                  inputProps={{ className: "w-full" }}
                  label="Maximum result count"
                  name="maxResultCount"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: updateSearchSettings.isPending,
                    maxValue: MAX_SEARCH_RESULT_COUNT,
                    minValue: MIN_SEARCH_RESULT_COUNT,
                  }}
                />
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  isDisabled={
                    updateSearchSettings.isPending || !form.formState.isDirty
                  }
                  isPending={updateSearchSettings.isPending}
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
            </section>
          </Form>

          <section className="border-separator bg-surface rounded-xl border">
            <div className="border-separator border-b px-4 py-3">
              <h2 className="text-foreground text-base font-medium">
                Providers
              </h2>
              <p className="text-muted mt-1 text-sm">
                Configure external web search providers. SearXNG can be
                self-hosted and installed from its official docs.
              </p>
            </div>

            <div className="divide-separator divide-y">
              {searchProviders.data?.map((provider) => (
                <div
                  className="flex items-center gap-4 px-4 py-3"
                  key={provider.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium">
                        {provider.displayName}
                      </span>
                      <Chip
                        color={STATUS_COLOR[provider.status]}
                        size="sm"
                        variant="soft"
                      >
                        {STATUS_LABEL[provider.status]}
                      </Chip>
                    </div>
                    <p className="text-muted mt-0.5 text-xs">
                      {provider.description}
                    </p>
                    {provider.installationDocsUrl ? (
                      <Link
                        className="mt-1 inline-flex text-xs text-primary transition-opacity hover:opacity-80"
                        href={provider.installationDocsUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Installation docs
                      </Link>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {provider.status !== "not_configured" ? (
                      <Switch
                        isDisabled={toggleProvider.isPending}
                        isSelected={provider.status === "active"}
                        onChange={() =>
                          toggleProvider.mutate({
                            isEnabled: provider.status !== "active",
                            provider: provider.id,
                          })
                        }
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    ) : null}

                    <Button
                      onPress={() =>
                        setModalProvider({
                          id: provider.id as SearchProviderKey,
                          name: provider.displayName,
                        })
                      }
                      size="sm"
                      variant={
                        provider.status === "not_configured"
                          ? "primary"
                          : "secondary"
                      }
                    >
                      {provider.status === "not_configured"
                        ? "Connect"
                        : "Edit"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {modalProvider ? (
        <SearchProviderConfigModal
          isOpen={Boolean(modalProvider)}
          onOpenChange={(open) => {
            if (!open) {
              setModalProvider(null);
            }
          }}
          provider={modalProvider.id}
          providerName={modalProvider.name}
        />
      ) : null}
    </SettingsPageWrapper>
  );
}

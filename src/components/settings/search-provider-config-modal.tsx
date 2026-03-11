"use client";

import { Button, Form, Modal, Spinner, useOverlayState } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ControlledSelectField,
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { LIVECRAWL_MODE_VALUES, SEARCH_TYPE_VALUES } from "@/lib/search";
import {
  exaSearchProviderConfigFormSchema,
  searxngSearchProviderConfigFormSchema,
} from "@/schemas/search-provider.schema";
import { api } from "@/trpc/react";

type SearchProviderConfigModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  provider: "exa" | "searxng";
  providerName: string;
};

const SEARCH_TYPE_OPTIONS = SEARCH_TYPE_VALUES.map((value) => ({
  label: value[0]?.toUpperCase() + value.slice(1),
  value,
}));

const LIVECRAWL_OPTIONS = LIVECRAWL_MODE_VALUES.map((value) => ({
  label: value[0]?.toUpperCase() + value.slice(1),
  value,
}));

function createDefaultValues(
  provider: SearchProviderConfigModalProps["provider"],
): Record<string, unknown> {
  if (provider === "searxng") {
    return {
      baseURL: "",
      defaultLivecrawl: "preferred",
      defaultSearchType: "auto",
      isEnabled: true,
    };
  }

  return {
    apiKey: "",
    defaultLivecrawl: "preferred",
    defaultSearchType: "auto",
    isEnabled: true,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function SearchProviderConfigModal({
  isOpen,
  onOpenChange,
  provider,
  providerName,
}: SearchProviderConfigModalProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const isSearxng = provider === "searxng";
  const formSchema = (
    isSearxng
      ? searxngSearchProviderConfigFormSchema
      : exaSearchProviderConfigFormSchema
  ) as never;
  const form = useForm<Record<string, unknown>>({
    defaultValues: createDefaultValues(provider),
    resolver: zodResolver(formSchema),
  });

  const providerQuery = api.searchProviders.get.useQuery(
    { provider },
    { enabled: isOpen },
  );
  const upsert = api.searchProviders.upsert.useMutation();
  const remove = api.searchProviders.delete.useMutation();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSubmitError("");
    form.reset(createDefaultValues(provider));
  }, [form, isOpen, provider]);

  useEffect(() => {
    if (!isOpen || !providerQuery.isSuccess) {
      return;
    }

    if (!providerQuery.data) {
      form.reset(createDefaultValues(provider));
      return;
    }

    if (isSearxng) {
      form.reset({
        baseURL: providerQuery.data.config.baseURL ?? "",
        defaultLivecrawl: "preferred",
        defaultSearchType: "auto",
        isEnabled: providerQuery.data.isEnabled,
      });
      return;
    }

    form.reset({
      apiKey: providerQuery.data.config.apiKey ?? "",
      defaultLivecrawl: providerQuery.data.settings.defaultLivecrawl,
      defaultSearchType: providerQuery.data.settings.defaultSearchType,
      isEnabled: providerQuery.data.isEnabled,
    });
  }, [
    form,
    isOpen,
    isSearxng,
    provider,
    providerQuery.data,
    providerQuery.isSuccess,
  ]);

  const handleSave = async (values: any) => {
    setSubmitError("");

    try {
      const result = await upsert.mutateAsync(
        provider === "searxng"
          ? {
              config: {
                baseURL: values.baseURL.trim().replace(/\/$/, ""),
              },
              isEnabled: values.isEnabled,
              provider,
              settings: {
                defaultLivecrawl: "preferred",
                defaultSearchType: "auto",
              },
            }
          : {
              config: {
                apiKey: values.apiKey.trim(),
              },
              isEnabled: values.isEnabled,
              provider,
              settings: {
                defaultLivecrawl: values.defaultLivecrawl,
                defaultSearchType: values.defaultSearchType,
              },
            },
      );

      utils.searchProviders.get.setData({ provider }, result);
      utils.searchProviders.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: values.isEnabled ? "active" : "disabled",
              }
            : item,
        ),
      );
      state.close();
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to save search provider settings."),
      );
    }
  };

  const handleDelete = async () => {
    setSubmitError("");

    try {
      await remove.mutateAsync({ provider });
      utils.searchProviders.get.setData({ provider }, null);
      utils.searchProviders.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: "not_configured",
              }
            : item,
        ),
      );
      state.close();
    } catch (error) {
      setSubmitError(
        getErrorMessage(
          error,
          "Unable to remove this search provider configuration.",
        ),
      );
    }
  };

  const isBusy =
    form.formState.isSubmitting || upsert.isPending || remove.isPending;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="border-separator w-full border sm:max-w-[460px]">
            <Form className="contents" onSubmit={form.handleSubmit(handleSave)}>
              <Modal.Header className="items-start justify-between gap-4">
                <div className="space-y-1">
                  <Modal.Heading>Configure {providerName}</Modal.Heading>
                  <p className="text-muted text-sm">
                    Manage credentials and defaults for {providerName} web
                    search.
                  </p>
                </div>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body className="p-2">
                <div className="flex flex-col gap-5">
                  {providerQuery.error ? (
                    <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                      {providerQuery.error.message}
                    </p>
                  ) : null}

                  {submitError ? (
                    <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                      {submitError}
                    </p>
                  ) : null}

                  <ControlledSwitchField
                    control={form.control}
                    description="Disabled search providers keep their credentials but are excluded from active websearch calls."
                    label="Enable provider"
                    name="isEnabled"
                    switchProps={{ isDisabled: isBusy, size: "sm" }}
                  />

                  <ControlledTextField
                    control={form.control}
                    description={
                      isSearxng
                        ? "Base URL of your SearXNG instance, for example https://search.example.com"
                        : "Your Exa API key is stored encrypted on this device."
                    }
                    inputProps={{
                      placeholder: isSearxng
                        ? "https://search.example.com"
                        : "exa_...",
                    }}
                    label={isSearxng ? "Base URL" : "API key"}
                    name={isSearxng ? "baseURL" : "apiKey"}
                    textFieldProps={{ isDisabled: isBusy }}
                  />

                  {isSearxng ? null : (
                    <>
                      <ControlledSelectField
                        control={form.control}
                        description="Default search depth used when the tool does not override it."
                        label="Default search type"
                        name="defaultSearchType"
                        options={SEARCH_TYPE_OPTIONS}
                        selectProps={{ isDisabled: isBusy }}
                      />

                      <ControlledSelectField
                        control={form.control}
                        description="Default crawl freshness behavior used when the tool does not override it."
                        label="Default live crawl"
                        name="defaultLivecrawl"
                        options={LIVECRAWL_OPTIONS}
                        selectProps={{ isDisabled: isBusy }}
                      />
                    </>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer className="justify-between">
                <div>
                  {providerQuery.data ? (
                    <Button
                      isDisabled={isBusy}
                      onPress={handleDelete}
                      type="button"
                      variant="danger"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    isDisabled={isBusy}
                    onPress={() => state.close()}
                    type="button"
                    variant="tertiary"
                  >
                    Cancel
                  </Button>
                  <Button isPending={isBusy} type="submit">
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

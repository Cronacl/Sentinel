"use client";

import {
  Button,
  Form,
  Modal,
  Skeleton,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import type { AIProvider } from "@/server/db/enums";
import {
  ControlledSwitchField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import {
  apiKeyProviderConfigFormSchema,
  googleVertexProviderConfigFormSchema,
  type GoogleVertexProviderConfigFormValues,
  type APIKeyProviderConfigFormValues,
  type ProviderConfigFormValues,
} from "@/schemas/settings.schema";
import { api } from "@/trpc/react";

interface ProviderConfigModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  provider: AIProvider;
  providerName: string;
}

function createDefaultValues(): ProviderConfigFormValues {
  return {
    apiKey: "",
    baseURL: "",
    clientEmail: "",
    isEnabled: true,
    location: "",
    privateKey: "",
    project: "",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function ProviderConfigModal({
  isOpen,
  onOpenChange,
  provider,
  providerName,
}: ProviderConfigModalProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const isVertexProvider = provider === "google_vertex";
  const formResolver: any = isVertexProvider
    ? zodResolver(googleVertexProviderConfigFormSchema)
    : zodResolver(apiKeyProviderConfigFormSchema);
  const form = useForm<ProviderConfigFormValues>({
    defaultValues: createDefaultValues(),
    resolver: formResolver,
  });

  const {
    data: existing,
    isLoading,
    isSuccess,
    error,
  } = api.providers.get.useQuery({ provider }, { enabled: isOpen });

  const upsert = api.providers.upsert.useMutation();
  const remove = api.providers.delete.useMutation();
  const toggle = api.providers.toggle.useMutation();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSubmitError("");
    form.reset(createDefaultValues());
  }, [form, isOpen, provider]);

  useEffect(() => {
    if (!isOpen || !isSuccess) {
      return;
    }

    if (!existing) {
      form.reset(createDefaultValues());
      return;
    }

    const config = existing.config as {
      apiKey?: string;
      baseURL?: string;
      location?: string;
      project?: string;
      googleAuthOptions?: {
        credentials?: {
          client_email?: string;
          private_key?: string;
        };
      };
    };
    form.reset({
      apiKey: !isVertexProvider ? (config.apiKey ?? "") : "",
      baseURL: !isVertexProvider ? (config.baseURL ?? "") : "",
      clientEmail: isVertexProvider
        ? (config.googleAuthOptions?.credentials?.client_email ?? "")
        : "",
      isEnabled: existing.isEnabled,
      location: isVertexProvider ? (config.location ?? "") : "",
      privateKey: isVertexProvider
        ? (config.googleAuthOptions?.credentials?.private_key ?? "")
        : "",
      project: isVertexProvider ? (config.project ?? "") : "",
    });
  }, [existing, form, isOpen, isSuccess, isVertexProvider]);

  const handleSave = async (values: ProviderConfigFormValues) => {
    setSubmitError("");

    try {
      const config = isVertexProvider
        ? {
            googleAuthOptions: {
              credentials: {
                client_email: (
                  values as GoogleVertexProviderConfigFormValues
                ).clientEmail.trim(),
                private_key: (values as GoogleVertexProviderConfigFormValues)
                  .privateKey,
              },
            },
            location: (
              values as GoogleVertexProviderConfigFormValues
            ).location.trim(),
            project: (
              values as GoogleVertexProviderConfigFormValues
            ).project.trim(),
          }
        : {
            apiKey: (values as APIKeyProviderConfigFormValues).apiKey.trim(),
            ...((values as APIKeyProviderConfigFormValues).baseURL.trim()
              ? {
                  baseURL: (
                    values as APIKeyProviderConfigFormValues
                  ).baseURL.trim(),
                }
              : {}),
          };

      await upsert.mutateAsync({
        config,
        provider,
      });

      if (!values.isEnabled) {
        await toggle.mutateAsync({
          isEnabled: false,
          provider,
        });
      }

      utils.providers.get.setData(
        { provider },
        {
          config,
          isEnabled: values.isEnabled,
          provider,
        },
      );
      utils.providers.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: values.isEnabled ? "active" : "disabled",
              }
            : item,
        ),
      );
      utils.models.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.provider === provider
            ? {
                ...item,
                isConnected: values.isEnabled,
              }
            : item,
        ),
      );
      state.close();
    } catch (mutationError) {
      setSubmitError(
        getErrorMessage(mutationError, "Unable to save provider settings."),
      );
    }
  };

  const handleDelete = async () => {
    setSubmitError("");

    try {
      await remove.mutateAsync({ provider });
      utils.providers.get.setData({ provider }, null);
      utils.providers.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === provider
            ? {
                ...item,
                status: "not_configured",
              }
            : item,
        ),
      );
      utils.models.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.provider === provider
            ? {
                ...item,
                isConnected: false,
              }
            : item,
        ),
      );
      state.close();
    } catch (mutationError) {
      setSubmitError(
        getErrorMessage(
          mutationError,
          "Unable to remove this provider configuration.",
        ),
      );
    }
  };

  const isBusy =
    form.formState.isSubmitting ||
    upsert.isPending ||
    remove.isPending ||
    toggle.isPending;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="border-separator w-full border sm:max-w-[460px]">
            <Modal.Header className="items-start justify-between gap-4">
              <div className="space-y-1">
                <Modal.Heading>Configure {providerName}</Modal.Heading>
                <p className="text-muted text-sm">
                  Manage credentials and activation state for {providerName}.
                </p>
              </div>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="p-2">
              {isLoading ? (
                <div className="flex flex-col gap-5">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-36 rounded-md" />
                    <Skeleton className="h-3 w-full rounded-md" />
                    <Skeleton className="h-3 w-4/5 rounded-md" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3 w-3/4 rounded-md" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3 w-2/3 rounded-md" />
                  </div>
                </div>
              ) : (
                <Form
                  className="flex flex-col gap-5"
                  onSubmit={form.handleSubmit(handleSave)}
                >
                  <ControlledSwitchField
                    control={form.control}
                    description="Disabled providers keep their credentials but are excluded from active model usage."
                    label="Enable provider"
                    name="isEnabled"
                    switchProps={{ isDisabled: isBusy, size: "sm" }}
                  />

                  {!isVertexProvider ? (
                    <>
                      <ControlledTextField
                        control={form.control}
                        description={`Sentinel stores this encrypted and uses it for requests to ${providerName}.`}
                        inputProps={{
                          autoComplete: "off",
                          placeholder: `Enter your ${providerName} API key`,
                          type: "password",
                        }}
                        label="API key"
                        name="apiKey"
                        textFieldProps={{ isRequired: true }}
                      />

                      <ControlledTextField
                        control={form.control}
                        description="Optional. Use this for compatible gateways, proxies, or self-hosted endpoints."
                        inputProps={{
                          autoComplete: "off",
                          placeholder: "https://api.example.com/v1",
                          type: "url",
                        }}
                        label="Base URL"
                        name="baseURL"
                      />
                    </>
                  ) : (
                    <>
                      <ControlledTextField
                        control={form.control}
                        description="Google Cloud region used for Vertex AI requests."
                        inputProps={{
                          autoComplete: "off",
                          placeholder: "us-central1",
                        }}
                        label="Location"
                        name="location"
                        textFieldProps={{ isRequired: true }}
                      />

                      <ControlledTextField
                        control={form.control}
                        description="Google Cloud project ID."
                        inputProps={{
                          autoComplete: "off",
                          placeholder: "my-project-id",
                        }}
                        label="Project ID"
                        name="project"
                        textFieldProps={{ isRequired: true }}
                      />

                      <ControlledTextField
                        control={form.control}
                        description="Service account email from your Google Cloud credentials."
                        inputProps={{
                          autoComplete: "off",
                          placeholder:
                            "service-account@project.iam.gserviceaccount.com",
                          type: "email",
                        }}
                        label="Service Account Email"
                        name="clientEmail"
                        textFieldProps={{ isRequired: true }}
                      />

                      <ControlledTextAreaField
                        control={form.control}
                        description="Paste the service account private key exactly as provided by Google Cloud."
                        label="Private Key"
                        name="privateKey"
                        textAreaProps={{
                          autoComplete: "off",
                          className: "min-h-32",
                          placeholder: "-----BEGIN PRIVATE KEY-----\n...",
                        }}
                        textFieldProps={{ isRequired: true }}
                      />
                    </>
                  )}

                  {error ? (
                    <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                      {error.message}
                    </p>
                  ) : null}

                  {submitError ? (
                    <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                      {submitError}
                    </p>
                  ) : null}

                  <Modal.Footer className="px-0 pb-0">
                    <div className="flex w-full items-center gap-2">
                      {existing ? (
                        <Button
                          className="mr-auto"
                          isDisabled={isBusy}
                          isPending={remove.isPending}
                          onPress={handleDelete}
                          size="sm"
                          variant="danger"
                        >
                          {({ isPending }) => (
                            <>
                              {isPending ? (
                                <Spinner color="current" size="sm" />
                              ) : null}
                              Remove
                            </>
                          )}
                        </Button>
                      ) : (
                        <div className="mr-auto" />
                      )}

                      <Button
                        isDisabled={isBusy}
                        onPress={() => state.close()}
                        size="sm"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        isDisabled={isLoading || remove.isPending}
                        isPending={
                          upsert.isPending || form.formState.isSubmitting
                        }
                        size="sm"
                        type="submit"
                        variant="primary"
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            {existing ? "Update" : "Connect"}
                          </>
                        )}
                      </Button>
                    </div>
                  </Modal.Footer>
                </Form>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

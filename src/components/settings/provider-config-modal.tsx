"use client";

import { Button, Form, Modal, Spinner, useOverlayState } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { getErrorMessage } from "@/lib/errors";
import { sileo } from "sileo";
import type { AIProvider } from "@/server/db/enums";
import {
  ControlledSwitchField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import {
  accessKeySecretKeyProviderConfigFormSchema,
  apiKeyProviderConfigFormSchema,
  apiTokenProviderConfigFormSchema,
  bedrockProviderConfigFormSchema,
  googleVertexProviderConfigFormSchema,
  ollamaProviderConfigFormSchema,
  type AccessKeySecretKeyProviderConfigFormValues,
  type APITokenProviderConfigFormValues,
  type BedrockProviderConfigFormValues,
  type GoogleVertexProviderConfigFormValues,
  type APIKeyProviderConfigFormValues,
  type OllamaProviderConfigFormValues,
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
    accessKey: "",
    accessKeyId: "",
    apiKey: "",
    apiToken: "",
    baseURL: "",
    clientEmail: "",
    isEnabled: true,
    location: "",
    privateKey: "",
    project: "",
    region: "",
    secretAccessKey: "",
    secretKey: "",
  };
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
  const isBedrockProvider = provider === "amazon_bedrock";
  const isOllamaProvider = provider === "ollama";
  const isReplicateProvider = provider === "replicate";
  const isKlingAIProvider = provider === "klingai";
  const formResolver: any = isVertexProvider
    ? zodResolver(googleVertexProviderConfigFormSchema)
    : isBedrockProvider
      ? zodResolver(bedrockProviderConfigFormSchema)
      : isOllamaProvider
        ? zodResolver(ollamaProviderConfigFormSchema)
        : isReplicateProvider
          ? zodResolver(apiTokenProviderConfigFormSchema)
          : isKlingAIProvider
            ? zodResolver(accessKeySecretKeyProviderConfigFormSchema)
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

    const config = existing.config as Record<string, unknown> & {
      accessKey?: string;
      apiKey?: string;
      apiToken?: string;
      baseURL?: string;
      location?: string;
      project?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      secretKey?: string;
      region?: string;
      googleAuthOptions?: {
        credentials?: {
          client_email?: string;
          private_key?: string;
        };
      };
    };
    form.reset({
      accessKeyId: isBedrockProvider ? (config.accessKeyId ?? "") : "",
      accessKey: isKlingAIProvider ? (config.accessKey ?? "") : "",
      apiKey:
        !isVertexProvider &&
        !isBedrockProvider &&
        !isOllamaProvider &&
        !isReplicateProvider &&
        !isKlingAIProvider
          ? (config.apiKey ?? "")
          : "",
      apiToken: isReplicateProvider ? (config.apiToken ?? "") : "",
      baseURL:
        !isVertexProvider && !isBedrockProvider ? (config.baseURL ?? "") : "",
      clientEmail: isVertexProvider
        ? (config.googleAuthOptions?.credentials?.client_email ?? "")
        : "",
      isEnabled: existing.isEnabled,
      location: isVertexProvider ? (config.location ?? "") : "",
      privateKey: isVertexProvider
        ? (config.googleAuthOptions?.credentials?.private_key ?? "")
        : "",
      project: isVertexProvider ? (config.project ?? "") : "",
      region: isBedrockProvider ? (config.region ?? "") : "",
      secretAccessKey: isBedrockProvider ? (config.secretAccessKey ?? "") : "",
      secretKey: isKlingAIProvider ? (config.secretKey ?? "") : "",
    });
  }, [
    existing,
    form,
    isOpen,
    isSuccess,
    isVertexProvider,
    isBedrockProvider,
    isKlingAIProvider,
    isOllamaProvider,
    isReplicateProvider,
  ]);

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
        : isBedrockProvider
          ? {
              accessKeyId: (
                values as BedrockProviderConfigFormValues
              ).accessKeyId.trim(),
              secretAccessKey: (
                values as BedrockProviderConfigFormValues
              ).secretAccessKey.trim(),
              region: (values as BedrockProviderConfigFormValues).region.trim(),
            }
          : isOllamaProvider
            ? {
                baseURL: (
                  (values as OllamaProviderConfigFormValues).baseURL ||
                  "http://localhost:11434/v1"
                ).trim(),
              }
            : isReplicateProvider
              ? {
                  apiToken: (
                    values as APITokenProviderConfigFormValues
                  ).apiToken.trim(),
                  ...((
                    values as APITokenProviderConfigFormValues
                  ).baseURL.trim()
                    ? {
                        baseURL: (
                          values as APITokenProviderConfigFormValues
                        ).baseURL.trim(),
                      }
                    : {}),
                }
              : isKlingAIProvider
                ? {
                    accessKey: (
                      values as AccessKeySecretKeyProviderConfigFormValues
                    ).accessKey.trim(),
                    secretKey: (
                      values as AccessKeySecretKeyProviderConfigFormValues
                    ).secretKey.trim(),
                    ...((
                      values as AccessKeySecretKeyProviderConfigFormValues
                    ).baseURL.trim()
                      ? {
                          baseURL: (
                            values as AccessKeySecretKeyProviderConfigFormValues
                          ).baseURL.trim(),
                        }
                      : {}),
                  }
                : {
                    apiKey: (
                      values as APIKeyProviderConfigFormValues
                    ).apiKey.trim(),
                    ...((
                      values as APIKeyProviderConfigFormValues
                    ).baseURL.trim()
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
      sileo.success({ description: "Provider saved." });
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
      sileo.success({ description: "Provider removed." });
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
            {isLoading ? (
              <>
                <Modal.Header className="items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Modal.Heading>Configure {providerName}</Modal.Heading>
                    <p className="text-muted text-sm">
                      Manage credentials and activation state for {providerName}
                      .
                    </p>
                  </div>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body>
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="sm" />
                  </div>
                </Modal.Body>
              </>
            ) : (
              <Form
                className="contents"
                onSubmit={form.handleSubmit(handleSave)}
              >
                <Modal.Header className="items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Modal.Heading>Configure {providerName}</Modal.Heading>
                    <p className="text-muted text-sm">
                      Manage credentials and activation state for {providerName}
                      .
                    </p>
                  </div>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body className="p-2">
                  <div className="flex flex-col gap-5">
                    <ControlledSwitchField
                      control={form.control}
                      description="Disabled providers keep their credentials but are excluded from active model usage."
                      label="Enable provider"
                      name="isEnabled"
                      switchProps={{ isDisabled: isBusy, size: "sm" }}
                    />

                    {isBedrockProvider ? (
                      <>
                        <ControlledTextField
                          control={form.control}
                          description="AWS access key ID for Bedrock API calls."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "AKIAIOSFODNN7EXAMPLE",
                            type: "password",
                          }}
                          label="Access Key ID"
                          name="accessKeyId"
                          textFieldProps={{ isRequired: true }}
                        />

                        <ControlledTextField
                          control={form.control}
                          description="AWS secret access key for Bedrock API calls."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "Enter your AWS secret access key",
                            type: "password",
                          }}
                          label="Secret Access Key"
                          name="secretAccessKey"
                          textFieldProps={{ isRequired: true }}
                        />

                        <ControlledTextField
                          control={form.control}
                          description="AWS region for Bedrock (e.g., us-east-1)."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "us-east-1",
                          }}
                          label="Region"
                          name="region"
                          textFieldProps={{ isRequired: true }}
                        />
                      </>
                    ) : isOllamaProvider ? (
                      <ControlledTextField
                        control={form.control}
                        description="URL of your Ollama instance. Defaults to http://localhost:11434/v1."
                        inputProps={{
                          autoComplete: "off",
                          placeholder: "http://localhost:11434/v1",
                          type: "url",
                        }}
                        label="Base URL"
                        name="baseURL"
                        textFieldProps={{ isRequired: true }}
                      />
                    ) : isReplicateProvider ? (
                      <>
                        <ControlledTextField
                          control={form.control}
                          description={`Sentinel stores this encrypted and uses it for requests to ${providerName}.`}
                          inputProps={{
                            autoComplete: "off",
                            placeholder: `Enter your ${providerName} API token`,
                            type: "password",
                          }}
                          label="API token"
                          name="apiToken"
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
                    ) : isKlingAIProvider ? (
                      <>
                        <ControlledTextField
                          control={form.control}
                          description="Kling AI access key used to sign API requests."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "Enter your Kling AI access key",
                            type: "password",
                          }}
                          label="Access Key"
                          name="accessKey"
                          textFieldProps={{ isRequired: true }}
                        />

                        <ControlledTextField
                          control={form.control}
                          description="Kling AI secret key used to sign API requests."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "Enter your Kling AI secret key",
                            type: "password",
                          }}
                          label="Secret Key"
                          name="secretKey"
                          textFieldProps={{ isRequired: true }}
                        />

                        <ControlledTextField
                          control={form.control}
                          description="Optional. Override the Kling AI API endpoint if needed."
                          inputProps={{
                            autoComplete: "off",
                            placeholder: "https://api-singapore.klingai.com",
                            type: "url",
                          }}
                          label="Base URL"
                          name="baseURL"
                        />
                      </>
                    ) : !isVertexProvider ? (
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
                  </div>
                </Modal.Body>

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
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

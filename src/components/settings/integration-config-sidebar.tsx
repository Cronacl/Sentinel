"use client";

import { Button, Drawer, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { getErrorMessage } from "@/lib/errors";
import { sileo } from "sileo";
import {
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { buildIntegrationOAuthRedirectUri } from "@/lib/app-origin";
import {
  INTEGRATION_METADATA,
  isIntegrationSetupReady,
} from "@/lib/integrations/metadata";
import { openIntegrationOAuthPopup } from "@/lib/integrations/oauth/popup";
import type { IntegrationProvider } from "@/server/db/enums";
import { api } from "@/trpc/react";

function isGoogleIntegration(provider: IntegrationProvider) {
  return (
    provider === "gmail" ||
    provider === "google_calendar" ||
    provider === "google_drive"
  );
}

function getProviderCopy(provider: IntegrationProvider) {
  if (isGoogleIntegration(provider)) {
    return {
      clientIdPlaceholder:
        "1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
      clientIdDescription:
        "Paste the OAuth client ID from your Google Cloud credentials.",
      clientSecretPlaceholder: "GOCSPX-...",
      clientSecretDescription:
        "Paste the OAuth client secret from Google Cloud.",
      redirectUriDescription:
        "This must exactly match an authorized redirect URI in your Google Cloud OAuth client.",
      redirectUriNote:
        "Google compares this value exactly. Make sure this matches the authorized redirect URI registered in your Google Cloud console.",
    };
  }

  if (provider === "github") {
    return {
      clientIdPlaceholder: "Iv1.a1b2c3d4e5f6g7h8",
      clientIdDescription:
        "Paste the Client ID from your GitHub OAuth App settings.",
      clientSecretPlaceholder: "your-client-secret",
      clientSecretDescription:
        "Paste the Client Secret from your GitHub OAuth App.",
      redirectUriDescription:
        "This must match the Authorization callback URL in your GitHub OAuth App.",
      redirectUriNote:
        "Enter this URL as the Authorization callback URL in your GitHub OAuth App settings.",
    };
  }

  if (provider === "notion") {
    return {
      clientIdPlaceholder: "your-notion-oauth-client-id",
      clientIdDescription:
        "Paste the OAuth client ID from your Notion Public Integration settings.",
      clientSecretPlaceholder: "secret_...",
      clientSecretDescription:
        "Paste the OAuth client secret from your Notion Public Integration.",
      redirectUriDescription:
        "This must match the Redirect URI in your Notion integration settings.",
      redirectUriNote:
        "Add this URL as a Redirect URI in your Notion integration at notion.so/my-integrations.",
    };
  }

  if (provider === "slack") {
    return {
      clientIdPlaceholder: "1234567890.1234567890123",
      clientIdDescription:
        "Paste the Client ID from your Slack App at api.slack.com/apps.",
      clientSecretPlaceholder: "your-slack-client-secret",
      clientSecretDescription:
        "Paste the Client Secret from your Slack App's OAuth & Permissions page.",
      redirectUriDescription:
        "This must match a Redirect URL in your Slack App's OAuth & Permissions settings.",
      redirectUriNote:
        "Add this URL as a Redirect URL in your Slack App at api.slack.com/apps.",
    };
  }

  if (provider === "airtable") {
    return {
      clientIdPlaceholder: "your-airtable-client-id",
      clientIdDescription:
        "Paste the Client ID from your Airtable OAuth integration at airtable.com/create/oauth.",
      clientSecretPlaceholder: "your-airtable-client-secret",
      clientSecretDescription:
        "Paste the Client Secret from your Airtable OAuth integration.",
      redirectUriDescription:
        "This must match a Redirect URL in your Airtable OAuth integration settings.",
      redirectUriNote:
        "Add this URL as a Redirect URL in your Airtable OAuth integration at airtable.com/create/oauth.",
    };
  }

  if (provider === "linear") {
    return {
      clientIdPlaceholder: "your-linear-client-id",
      clientIdDescription:
        "Paste the Client ID from your Linear OAuth2 Application settings.",
      clientSecretPlaceholder: "your-linear-client-secret",
      clientSecretDescription:
        "Paste the Client Secret from your Linear OAuth2 Application.",
      redirectUriDescription:
        "This must match a Redirect callback URL in your Linear OAuth2 Application.",
      redirectUriNote:
        "Add this URL as a Redirect callback URL in your Linear OAuth2 Application at linear.app/settings/api.",
    };
  }

  return {
    clientIdPlaceholder: "client-id",
    clientIdDescription: "Paste the OAuth client ID.",
    clientSecretPlaceholder: "client-secret",
    clientSecretDescription: "Paste the OAuth client secret.",
    redirectUriDescription:
      "This must match the redirect URI configured in your OAuth application.",
    redirectUriNote:
      "Copy this URI into your OAuth application's redirect URI settings.",
  };
}

const integrationConfigFormSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required."),
  clientSecret: z.string(),
  redirectUri: z
    .string()
    .trim()
    .min(1, "Redirect URI is required.")
    .url("Enter a valid redirect URI."),
  isEnabled: z.boolean(),
});

type IntegrationConfigFormValues = z.infer<typeof integrationConfigFormSchema>;

export type IntegrationSummary = {
  hasOAuthApp: boolean;
  isConnected: boolean;
  isEnabled: boolean;
  label: string;
  provider: IntegrationProvider;
};

type IntegrationConfigDrawerProps = {
  integration: IntegrationSummary | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

function createDefaultValues(
  integration: IntegrationSummary,
): IntegrationConfigFormValues {
  return {
    clientId: "",
    clientSecret: "",
    redirectUri: buildIntegrationOAuthRedirectUri(),
    isEnabled: integration.isConnected ? integration.isEnabled : true,
  };
}

function IntegrationDrawerContent({
  integration,
}: {
  integration: IntegrationSummary;
}) {
  const utils = api.useUtils();
  const metadata = INTEGRATION_METADATA[integration.provider];
  const isSetupReady = isIntegrationSetupReady(integration.provider);
  const providerCopy = getProviderCopy(integration.provider);
  const [submitError, setSubmitError] = useState("");

  const form = useForm<IntegrationConfigFormValues>({
    defaultValues: createDefaultValues(integration),
    resolver: zodResolver(integrationConfigFormSchema),
  });

  const oauthAppQuery = api.integrations.getOAuthApp.useQuery(
    { provider: integration.provider },
    { enabled: isSetupReady },
  );
  const upsertOAuthApp = api.integrations.upsertOAuthApp.useMutation();
  const deleteOAuthApp = api.integrations.deleteOAuthApp.useMutation();
  const connect = api.integrations.connect.useMutation();
  const disconnect = api.integrations.disconnect.useMutation();
  const toggle = api.integrations.toggle.useMutation();

  useEffect(() => {
    setSubmitError("");
    form.reset(createDefaultValues(integration));
  }, [form, integration]);

  useEffect(() => {
    if (!isSetupReady || !oauthAppQuery.isSuccess) {
      return;
    }

    form.reset({
      clientId: oauthAppQuery.data?.clientId ?? "",
      clientSecret: "",
      redirectUri:
        oauthAppQuery.data?.redirectUri ?? buildIntegrationOAuthRedirectUri(),
      isEnabled: integration.isConnected ? integration.isEnabled : true,
    });
  }, [
    form,
    integration.isConnected,
    integration.isEnabled,
    isSetupReady,
    oauthAppQuery.data,
    oauthAppQuery.isSuccess,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const channel = new BroadcastChannel("sentinel-integration-oauth");
    const clearError = (data?: { success?: boolean; type?: string }) => {
      if (!data?.success || data.type !== "integration-oauth-complete") {
        return;
      }

      setSubmitError("");
    };
    const onChannelMessage = (event: MessageEvent<{ success?: boolean }>) => {
      clearError({
        success: event.data?.success,
        type: "integration-oauth-complete",
      });
    };
    const onWindowMessage = (
      event: MessageEvent<{ success?: boolean; type?: string }>,
    ) => {
      clearError(event.data);
    };

    channel.addEventListener("message", onChannelMessage);
    window.addEventListener("message", onWindowMessage);

    return () => {
      channel.removeEventListener("message", onChannelMessage);
      channel.close();
      window.removeEventListener("message", onWindowMessage);
    };
  }, []);

  const existingOAuthApp = oauthAppQuery.data;
  const isBusy =
    form.formState.isSubmitting ||
    oauthAppQuery.isLoading ||
    upsertOAuthApp.isPending ||
    deleteOAuthApp.isPending ||
    connect.isPending ||
    disconnect.isPending ||
    toggle.isPending;

  const handleSave = async (values: IntegrationConfigFormValues) => {
    setSubmitError("");

    if (!existingOAuthApp?.hasClientSecret && !values.clientSecret.trim()) {
      form.setError("clientSecret", {
        message:
          "Client secret is required the first time you configure this integration.",
      });
      return;
    }

    try {
      const normalizedClientId = values.clientId.trim();
      const normalizedClientSecret = values.clientSecret.trim();
      const normalizedRedirectUri = values.redirectUri.trim();
      const shouldSaveCredentials =
        !existingOAuthApp ||
        existingOAuthApp.clientId !== normalizedClientId ||
        existingOAuthApp.redirectUri !== normalizedRedirectUri ||
        normalizedClientSecret.length > 0;

      if (shouldSaveCredentials) {
        await upsertOAuthApp.mutateAsync({
          clientId: normalizedClientId,
          clientSecret: normalizedClientSecret || undefined,
          provider: integration.provider,
          redirectUri: normalizedRedirectUri,
        });
      }

      if (integration.isConnected) {
        if (values.isEnabled !== integration.isEnabled) {
          await toggle.mutateAsync({
            isEnabled: values.isEnabled,
            provider: integration.provider,
          });
        }

        await utils.integrations.list.invalidate();
        return;
      }

      const { authorizationUrl } = await connect.mutateAsync({
        provider: integration.provider,
      });

      await openIntegrationOAuthPopup(authorizationUrl, () => {
        void utils.integrations.list.invalidate();
      });

      if (!values.isEnabled) {
        await toggle.mutateAsync({
          isEnabled: false,
          provider: integration.provider,
        });
      }

      await utils.integrations.list.invalidate();
      sileo.success({ description: "Integration saved." });
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to save integration settings."),
      );
    }
  };

  const handleConnect = async () => {
    setSubmitError("");

    try {
      const { authorizationUrl } = await connect.mutateAsync({
        provider: integration.provider,
      });

      await openIntegrationOAuthPopup(authorizationUrl, () => {
        void utils.integrations.list.invalidate();
      });

      await utils.integrations.list.invalidate();
      sileo.success({ description: "Integration connected." });
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to connect this integration."),
      );
    }
  };

  const handleDisconnect = async () => {
    setSubmitError("");

    try {
      await disconnect.mutateAsync({ provider: integration.provider });
      await utils.integrations.list.invalidate();
      sileo.success({ description: "Integration disconnected." });
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to disconnect this integration."),
      );
    }
  };

  const handleDeleteCredentials = async () => {
    setSubmitError("");

    try {
      await deleteOAuthApp.mutateAsync({ provider: integration.provider });
      await utils.integrations.list.invalidate();
      sileo.success({ description: "Credentials removed." });
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to remove saved credentials."),
      );
    }
  };

  const statusText = integration.isConnected
    ? integration.isEnabled
      ? "Sentinel can use this integration right now."
      : "Connected but tools are currently disabled."
    : existingOAuthApp
      ? "Credentials saved. Connect to complete authorization."
      : metadata.setupHint;

  return (
    <Form className="contents" onSubmit={form.handleSubmit(handleSave)}>
      <Drawer.Header className="flex-col items-start gap-0 pb-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80">
            <IntegrationProviderIcon
              className="h-4.5 w-4.5"
              provider={integration.provider}
            />
          </div>
          <div className="min-w-0">
            <Drawer.Heading className="text-base">
              {integration.label}
            </Drawer.Heading>
            <p className="text-xs text-muted">{statusText}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-foreground/70">
          {metadata.description}
        </p>
      </Drawer.Header>

      <Drawer.Body className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-foreground">What you get</h3>
          <ul className="space-y-1">
            {metadata.highlights.map((item) => (
              <li className="text-xs text-muted" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {metadata.requiredAccess.length > 0 ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-foreground">
              Requested access
            </h3>
            <ul className="space-y-1">
              {metadata.requiredAccess.map((item) => (
                <li className="text-xs text-muted" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isSetupReady ? (
          <>
            <div className="h-px bg-border/40" />

            <ControlledSwitchField
              control={form.control}
              description={
                integration.isConnected
                  ? "Disabled integrations stay connected, but Sentinel will not use their tools."
                  : "Start enabled so Sentinel can use this integration as soon as OAuth completes."
              }
              label="Enable integration"
              name="isEnabled"
              switchProps={{ isDisabled: isBusy, size: "sm" }}
            />

            <ControlledTextField
              control={form.control}
              description={providerCopy.clientIdDescription}
              inputProps={{
                autoComplete: "off",
                placeholder: providerCopy.clientIdPlaceholder,
              }}
              label="Client ID"
              name="clientId"
              textFieldProps={{ isRequired: true }}
            />

            <ControlledTextField
              control={form.control}
              description={
                existingOAuthApp?.hasClientSecret
                  ? "Leave blank to keep the current secret, or paste a new one to replace it."
                  : providerCopy.clientSecretDescription
              }
              inputProps={{
                autoComplete: "off",
                placeholder: existingOAuthApp?.hasClientSecret
                  ? "Current secret is already stored"
                  : providerCopy.clientSecretPlaceholder,
                type: "password",
              }}
              label="Client Secret"
              name="clientSecret"
            />

            <ControlledTextField
              control={form.control}
              description={providerCopy.redirectUriDescription}
              inputProps={{
                autoComplete: "off",
                placeholder: buildIntegrationOAuthRedirectUri(),
                type: "url",
              }}
              label="Redirect URI"
              name="redirectUri"
              textFieldProps={{ isRequired: true }}
            />

            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-foreground">
                Callback URL
              </h3>
              <p className="text-xs text-muted">
                {providerCopy.redirectUriNote}
              </p>
              <code className="block overflow-x-auto rounded-lg border border-border/50 bg-background px-3 py-2 text-[11px] text-foreground">
                {form.watch("redirectUri") ||
                  buildIntegrationOAuthRedirectUri()}
              </code>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted">
            This provider is visible in the catalog, but setup is not available
            yet.
          </p>
        )}

        {oauthAppQuery.error ? (
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            {oauthAppQuery.error.message}
          </p>
        ) : null}

        {submitError ? (
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            {submitError}
          </p>
        ) : null}
      </Drawer.Body>

      <Drawer.Footer>
        <div className="flex w-full flex-wrap items-center gap-2">
          {integration.isConnected ? (
            <Button
              isDisabled={isBusy}
              isPending={disconnect.isPending}
              onPress={handleDisconnect}
              size="sm"
              type="button"
              variant="danger"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Disconnect
                </>
              )}
            </Button>
          ) : existingOAuthApp ? (
            <>
              <Button
                isDisabled={isBusy}
                isPending={connect.isPending}
                onPress={handleConnect}
                size="sm"
                type="button"
                variant="primary"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Connect
                  </>
                )}
              </Button>
              <Button
                isDisabled={isBusy}
                isPending={deleteOAuthApp.isPending}
                onPress={handleDeleteCredentials}
                size="sm"
                type="button"
                variant="danger-soft"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Remove credentials
                  </>
                )}
              </Button>
            </>
          ) : null}

          {isSetupReady ? (
            <Button
              className="ml-auto"
              isDisabled={oauthAppQuery.isLoading || disconnect.isPending}
              isPending={
                form.formState.isSubmitting ||
                upsertOAuthApp.isPending ||
                toggle.isPending
              }
              size="sm"
              type="submit"
              variant={
                existingOAuthApp || integration.isConnected
                  ? "secondary"
                  : "primary"
              }
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {integration.isConnected
                    ? "Update"
                    : existingOAuthApp
                      ? "Save changes"
                      : "Save & connect"}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </Drawer.Footer>
    </Form>
  );
}

export function IntegrationConfigDrawer({
  integration,
  isOpen,
  onOpenChange,
}: IntegrationConfigDrawerProps) {
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="rounded-none bg-background dark:bg-surface">
          <Drawer.CloseTrigger />
          {integration ? (
            <IntegrationDrawerContent integration={integration} />
          ) : null}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

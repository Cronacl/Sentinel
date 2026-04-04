"use client";

import { Button, Chip, Drawer, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { sileo } from "sileo";
import {
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { INTEGRATION_METADATA } from "@/lib/integrations/metadata";
import type { DatabaseIntegrationProvider } from "@/server/db/enums";
import { api } from "@/trpc/react";

const DEFAULT_PORTS: Record<DatabaseIntegrationProvider, string> = {
  postgresql: "5432",
  mysql: "3306",
  mongodb: "27017",
};

const databaseConfigFormSchema = z
  .object({
    host: z.string().trim(),
    port: z.string().trim(),
    database: z.string().trim(),
    username: z.string().trim(),
    password: z.string(),
    connectionUrl: z.string().trim(),
    useConnectionUrl: z.boolean(),
    ssl: z.boolean(),
    isEnabled: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.useConnectionUrl) {
      if (!data.connectionUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Connection URL is required.",
          path: ["connectionUrl"],
        });
      }
    } else {
      if (!data.host) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Host is required.",
          path: ["host"],
        });
      }
      if (!data.port) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Port is required.",
          path: ["port"],
        });
      }
      if (!data.username) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Username is required.",
          path: ["username"],
        });
      }
    }
  });

type DatabaseConfigFormValues = z.infer<typeof databaseConfigFormSchema>;

export type DatabaseIntegrationSummary = {
  hasDbConfig?: boolean;
  isConnected: boolean;
  isEnabled: boolean;
  label: string;
  provider: DatabaseIntegrationProvider;
};

type DatabaseConfigDrawerProps = {
  integration: DatabaseIntegrationSummary | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

function DatabaseDrawerContent({
  integration,
}: {
  integration: DatabaseIntegrationSummary;
}) {
  const utils = api.useUtils();
  const metadata = INTEGRATION_METADATA[integration.provider];
  const [submitError, setSubmitError] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    version?: string;
    error?: string;
  } | null>(null);

  const form = useForm<DatabaseConfigFormValues>({
    defaultValues: {
      host: "localhost",
      port: DEFAULT_PORTS[integration.provider],
      database: "",
      username: "",
      password: "",
      connectionUrl: "",
      useConnectionUrl: false,
      ssl: false,
      isEnabled: true,
    },
    resolver: zodResolver(databaseConfigFormSchema),
  });

  const dbConfigQuery = api.integrations.getDatabaseConfig.useQuery(
    { provider: integration.provider },
    { enabled: true },
  );
  const saveDatabaseConfig = api.integrations.saveDatabaseConfig.useMutation();
  const testConnection = api.integrations.testDatabaseConnection.useMutation();
  const removeDatabaseConfig =
    api.integrations.removeDatabaseConfig.useMutation();
  const toggle = api.integrations.toggle.useMutation();

  useEffect(() => {
    setSubmitError("");
    setTestResult(null);
  }, [integration.provider]);

  useEffect(() => {
    if (!dbConfigQuery.isSuccess || !dbConfigQuery.data) return;

    const data = dbConfigQuery.data;
    form.reset({
      host: data.host || "localhost",
      port: data.port || DEFAULT_PORTS[integration.provider],
      database: data.database || "",
      username: data.username || "",
      password: "",
      connectionUrl: data.connectionUrl || "",
      useConnectionUrl: data.useConnectionUrl,
      ssl: data.ssl,
      isEnabled: integration.isEnabled,
    });
  }, [
    dbConfigQuery.data,
    dbConfigQuery.isSuccess,
    form,
    integration.isEnabled,
    integration.provider,
  ]);

  const useConnectionUrl = form.watch("useConnectionUrl");

  const isBusy =
    form.formState.isSubmitting ||
    saveDatabaseConfig.isPending ||
    testConnection.isPending ||
    removeDatabaseConfig.isPending ||
    toggle.isPending;

  const handleSave = async (values: DatabaseConfigFormValues) => {
    setSubmitError("");

    try {
      await saveDatabaseConfig.mutateAsync({
        provider: integration.provider,
        host: values.host,
        port: values.port,
        database: values.database || undefined,
        username: values.username,
        password: values.password || undefined,
        connectionUrl: values.connectionUrl || undefined,
        useConnectionUrl: values.useConnectionUrl,
        ssl: values.ssl,
      });

      if (values.isEnabled !== integration.isEnabled) {
        await toggle.mutateAsync({
          isEnabled: values.isEnabled,
          provider: integration.provider,
        });
      }

      await utils.integrations.list.invalidate();
      sileo.success({ description: "Database configuration saved." });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to save database configuration.",
      );
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    const values = form.getValues();

    try {
      const result = await testConnection.mutateAsync({
        provider: integration.provider,
        host: values.host,
        port: values.port,
        database: values.database || undefined,
        username: values.username,
        password: values.password,
        connectionUrl: values.connectionUrl || undefined,
        useConnectionUrl: values.useConnectionUrl,
        ssl: values.ssl,
      });

      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error:
          error instanceof Error ? error.message : "Connection test failed.",
      });
    }
  };

  const handleRemove = async () => {
    setSubmitError("");
    try {
      await removeDatabaseConfig.mutateAsync({
        provider: integration.provider,
      });
      await utils.integrations.list.invalidate();
      sileo.success({ description: "Database disconnected." });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to remove database configuration.",
      );
    }
  };

  const statusText = integration.isConnected
    ? integration.isEnabled
      ? "Sentinel can use this database right now."
      : "Connected but tools are currently disabled."
    : metadata.setupHint;

  return (
    <Form
      className="contents"
      validationBehavior="aria"
      onSubmit={form.handleSubmit(handleSave)}
    >
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

        <div className="h-px bg-border/40" />

        <ControlledSwitchField
          control={form.control}
          description="Toggle to use a full connection URL instead of individual fields."
          label="Use connection URL"
          name="useConnectionUrl"
          switchProps={{ isDisabled: isBusy, size: "sm" }}
        />

        {useConnectionUrl ? (
          <ControlledTextField
            control={form.control}
            description={`Full ${integration.label} connection URL.`}
            inputProps={{
              autoComplete: "off",
              placeholder:
                integration.provider === "mongodb"
                  ? "mongodb://user:password@host:27017/database"
                  : integration.provider === "mysql"
                    ? "mysql://user:password@host:3306/database"
                    : "postgresql://user:password@host:5432/database",
            }}
            label="Connection URL"
            name="connectionUrl"
          />
        ) : (
          <>
            <ControlledTextField
              control={form.control}
              description="Database server hostname or IP address."
              inputProps={{
                autoComplete: "off",
                placeholder: "localhost",
              }}
              label="Host"
              name="host"
            />

            <ControlledTextField
              control={form.control}
              description="Port number."
              inputProps={{
                autoComplete: "off",
                placeholder: DEFAULT_PORTS[integration.provider],
                type: "number",
              }}
              label="Port"
              name="port"
            />

            <ControlledTextField
              control={form.control}
              description="Default database name (optional)."
              inputProps={{
                autoComplete: "off",
                placeholder:
                  integration.provider === "mongodb" ? "admin" : "mydb",
              }}
              label="Database"
              name="database"
            />

            <ControlledTextField
              control={form.control}
              description="Database username."
              inputProps={{
                autoComplete: "off",
                placeholder:
                  integration.provider === "postgresql"
                    ? "postgres"
                    : integration.provider === "mongodb"
                      ? "admin"
                      : "root",
              }}
              label="Username"
              name="username"
            />

            <ControlledTextField
              control={form.control}
              description={
                integration.isConnected
                  ? "Leave blank to keep the current password."
                  : "Database password."
              }
              inputProps={{
                autoComplete: "off",
                placeholder: integration.isConnected
                  ? "Current password stored"
                  : "Enter password",
                type: "password",
              }}
              label="Password"
              name="password"
            />
          </>
        )}

        <ControlledSwitchField
          control={form.control}
          description="Enable SSL/TLS for the database connection."
          label="SSL"
          name="ssl"
          switchProps={{ isDisabled: isBusy, size: "sm" }}
        />

        <ControlledSwitchField
          control={form.control}
          description={
            integration.isConnected
              ? "Disabled integrations stay saved, but Sentinel will not use their tools."
              : "Start enabled so Sentinel can use this integration immediately."
          }
          label="Enable integration"
          name="isEnabled"
          switchProps={{ isDisabled: isBusy, size: "sm" }}
        />

        {testResult ? (
          <div
            className={`rounded-xl border px-3 py-2.5 text-xs ${
              testResult.success
                ? "border-success-soft-hover bg-success/10 text-success"
                : "border-danger-soft-hover bg-danger-soft text-danger-soft-foreground"
            }`}
          >
            {testResult.success ? (
              <div className="flex items-center gap-2">
                <Chip color="success" size="sm" variant="soft">
                  Connected
                </Chip>
                <span>
                  {testResult.version
                    ? `Server: ${testResult.version.slice(0, 80)}`
                    : "Connection successful"}
                </span>
              </div>
            ) : (
              <p>{testResult.error ?? "Connection failed."}</p>
            )}
          </div>
        ) : null}

        {submitError ? (
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            {submitError}
          </p>
        ) : null}
      </Drawer.Body>

      <Drawer.Footer>
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button
            isDisabled={isBusy}
            isPending={testConnection.isPending}
            onPress={handleTestConnection}
            size="sm"
            type="button"
            variant="secondary"
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                Test connection
              </>
            )}
          </Button>

          <Button
            className="ml-auto"
            isDisabled={isBusy}
            isPending={
              form.formState.isSubmitting ||
              saveDatabaseConfig.isPending ||
              toggle.isPending
            }
            size="sm"
            type="submit"
            variant="primary"
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {integration.isConnected ? "Update" : "Save & connect"}
              </>
            )}
          </Button>

          {integration.isConnected ? (
            <Button
              isDisabled={isBusy}
              isPending={removeDatabaseConfig.isPending}
              onPress={handleRemove}
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
          ) : null}
        </div>
      </Drawer.Footer>
    </Form>
  );
}

export function DatabaseConfigDrawer({
  integration,
  isOpen,
  onOpenChange,
}: DatabaseConfigDrawerProps) {
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          {integration ? (
            <DatabaseDrawerContent integration={integration} />
          ) : null}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

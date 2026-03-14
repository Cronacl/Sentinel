"use client";

import {
  Button,
  Form,
  Input,
  Skeleton,
  Surface,
  Tabs,
  TextField,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { ZodError } from "zod";

import {
  McpHttpTransportSection,
  McpStdioTransportSection,
} from "@/components/settings/mcp-server-form-sections";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import {
  createDefaultMcpServerFormValues,
  mcpConfigToFormValues,
  mcpServerFormSchema,
  normalizeMcpServerFormValues,
  type McpServerFormValues,
  type McpServerHttpFormValues,
  type McpServerStdioFormValues,
} from "@/schemas/mcp-server.schema";
import { api } from "@/trpc/react";

type McpServerFormProps = {
  mode: "create" | "edit";
  serverId?: string;
};

function McpServerFormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Surface className="rounded-xl border border-separator p-5">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </Surface>
    </div>
  );
}

function getFirstZodError(error: ZodError) {
  return error.issues[0]?.message ?? "Invalid MCP server configuration.";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-foreground text-sm font-medium">{children}</h3>;
}

export function McpServerForm({ mode, serverId }: McpServerFormProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<McpServerFormValues>({
    defaultValues: createDefaultMcpServerFormValues(),
    resolver: zodResolver(mcpServerFormSchema) as Resolver<McpServerFormValues>,
  });

  const query = api.mcpServers.get.useQuery(
    { id: serverId ?? "" },
    { enabled: mode === "edit" && Boolean(serverId) },
  );

  const catalogEntry = useMemo(
    () =>
      query.data?.catalogId
        ? (getMcpCatalogEntry(query.data.catalogId) ?? null)
        : null,
    [query.data?.catalogId],
  );

  const save = api.mcpServers.upsert.useMutation({
    onSuccess: async () => {
      setSubmitError("");
      await utils.mcpServers.list.invalidate();
      router.push("/settings/mcp");
    },
    onError: (error) => {
      setSubmitError(error.message);
    },
  });

  const remove = api.mcpServers.delete.useMutation({
    onSuccess: async () => {
      await utils.mcpServers.list.invalidate();
      router.push("/settings/mcp");
    },
    onError: (error) => {
      setSubmitError(error.message);
    },
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    form.reset(
      mcpConfigToFormValues({
        catalogId: query.data.catalogId,
        config: query.data.config,
        id: query.data.id,
        isEnabled: query.data.isEnabled,
        name: query.data.name,
        transport: query.data.transport,
      }),
    );
  }, [form, query.data]);

  const transport = form.watch("transport");
  const httpForm = form as UseFormReturn<McpServerHttpFormValues>;
  const stdioForm = form as UseFormReturn<McpServerStdioFormValues>;
  const headers = transport === "http" ? httpForm.watch("headers") : [];
  const headersFromEnv =
    transport === "http" ? httpForm.watch("headersFromEnv") : [];
  const args = transport === "stdio" ? stdioForm.watch("args") : [];
  const envVars = transport === "stdio" ? stdioForm.watch("envVars") : [];
  const envPassthrough =
    transport === "stdio" ? stdioForm.watch("envPassthrough") : [];
  const isBusy = save.isPending || remove.isPending;
  const isCatalogServer = Boolean(catalogEntry);

  const switchTransport = (nextTransport: "http" | "stdio") => {
    if (isCatalogServer || nextTransport === transport) {
      return;
    }

    const current = form.getValues();
    form.reset({
      ...createDefaultMcpServerFormValues(nextTransport),
      id: current.id,
      isEnabled: current.isEnabled,
      name: current.name,
    });
    setSubmitError("");
  };

  const handleSave = async (values: McpServerFormValues) => {
    setSubmitError("");

    try {
      await save.mutateAsync(normalizeMcpServerFormValues(values));
    } catch (error) {
      if (error instanceof ZodError) {
        setSubmitError(getFirstZodError(error));
      }
    }
  };

  const handleDelete = async () => {
    if (!serverId) {
      return;
    }

    setSubmitError("");
    await remove.mutateAsync({ id: serverId });
  };

  if (mode === "edit" && query.isPending && !query.data) {
    return (
      <SettingsPageWrapper
        subtitle="Update transport settings, secrets, and execution details for this MCP server."
        title="Edit MCP server"
      >
        <McpServerFormSkeleton />
      </SettingsPageWrapper>
    );
  }

  if (mode === "edit" && query.error && !query.data) {
    return (
      <SettingsPageWrapper
        subtitle="This MCP server entry could not be loaded. You can remove it and recreate it."
        title="Edit MCP server"
      >
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
          {query.error.message}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Link className="text-muted text-sm underline" href="/settings/mcp">
            Back to MCP servers
          </Link>
          <Button
            isDisabled={remove.isPending}
            isPending={remove.isPending}
            onPress={() => void handleDelete()}
            size="sm"
            variant="tertiary"
          >
            Delete server
          </Button>
        </div>
      </SettingsPageWrapper>
    );
  }

  const pageTitle =
    mode === "create"
      ? "Connect to a custom MCP"
      : isCatalogServer
        ? `Update ${catalogEntry?.name} MCP`
        : "Edit MCP server";

  const pageSubtitle =
    mode === "create" ? (
      <>
        Manage one custom MCP server connection.{" "}
        <Link
          className="text-foreground underline"
          href="https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools"
          rel="noreferrer"
          target="_blank"
        >
          Docs
        </Link>
      </>
    ) : isCatalogServer ? (
      "If you would like to switch MCP server type, please uninstall first."
    ) : (
      "Update transport settings, secrets, and execution details for this MCP server."
    );

  return (
    <SettingsPageWrapper
      actions={
        mode === "edit" ? (
          <Button
            isDisabled={isBusy}
            onPress={() => void handleDelete()}
            size="sm"
            variant="danger"
          >
            {isCatalogServer ? "Uninstall" : "Delete server"}
          </Button>
        ) : null
      }
      subtitle={pageSubtitle}
      title={pageTitle}
    >
      {submitError ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

      <Form onSubmit={form.handleSubmit(handleSave as never)}>
        {!isCatalogServer ? (
          <Surface className="rounded-xl border border-separator p-5">
            <div className="space-y-4">
              <TextField fullWidth name="name">
                <SectionLabel>Name</SectionLabel>
                <Input
                  {...form.register("name")}
                  placeholder="MCP server name"
                  variant="secondary"
                />
              </TextField>

              <Tabs
                className="w-full"
                onSelectionChange={(key) =>
                  switchTransport(key as "http" | "stdio")
                }
                selectedKey={transport}
              >
                <Tabs.ListContainer>
                  <Tabs.List
                    aria-label="Transport type"
                    className="w-full *:flex-1 *:justify-center"
                  >
                    <Tabs.Tab id="stdio" isDisabled={isBusy}>
                      STDIO
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="http" isDisabled={isBusy}>
                      Streamable HTTP
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>
              </Tabs>
            </div>
          </Surface>
        ) : null}

        <Surface
          className={`${isCatalogServer ? "" : "mt-4 "}rounded-xl border border-separator p-5`}
        >
          {transport === "http" ? (
            <McpHttpTransportSection
              form={httpForm}
              headers={headers}
              headersFromEnv={headersFromEnv}
              isBusy={isBusy}
            />
          ) : (
            <McpStdioTransportSection
              args={args}
              envPassthrough={envPassthrough}
              envVars={envVars}
              form={stdioForm}
              isBusy={isBusy}
            />
          )}
        </Surface>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            {mode === "create" ? (
              <Link
                className="text-muted text-sm underline"
                href="/settings/mcp"
              >
                Back to MCP servers
              </Link>
            ) : null}
          </div>

          <Button
            isDisabled={isBusy}
            isPending={save.isPending}
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </div>
      </Form>
    </SettingsPageWrapper>
  );
}

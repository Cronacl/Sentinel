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
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { ZodError } from "zod";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import {
  createDefaultMcpServerFormValues,
  mcpConfigToFormValues,
  mcpServerFormSchema,
  normalizeMcpServerFormValues,
  type McpServerFormValues,
} from "@/schemas/mcp-server.schema";
import { api } from "@/trpc/react";

type McpServerFormProps = {
  mode: "create" | "edit";
  serverId?: string;
};

type KeyValueRow = { key: string; value: string };
type ValueRow = { value: string };

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-foreground text-sm font-semibold">{children}</h3>;
}

function KeyValueRows({
  rows,
  fieldPrefix,
  register,
  onRemove,
  isBusy,
}: {
  fieldPrefix: string;
  isBusy: boolean;
  onRemove: (index: number) => void;
  register: ReturnType<typeof useForm>["register"];
  rows: KeyValueRow[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((_, index) => (
        <div
          className="grid grid-cols-[1fr_1fr_auto] gap-2"
          key={`${fieldPrefix}-${index}`}
        >
          <Input
            {...register(`${fieldPrefix}.${index}.key` as never)}
            placeholder="Key"
            variant="secondary"
          />
          <Input
            {...register(`${fieldPrefix}.${index}.value` as never)}
            placeholder="Value"
            variant="secondary"
          />
          <Button
            isDisabled={isBusy}
            isIconOnly
            onPress={() => onRemove(index)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Delete02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ValueRows({
  rows,
  fieldPrefix,
  register,
  onRemove,
  isBusy,
  placeholder = "Value",
}: {
  fieldPrefix: string;
  isBusy: boolean;
  onRemove: (index: number) => void;
  placeholder?: string;
  register: ReturnType<typeof useForm>["register"];
  rows: ValueRow[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((_, index) => (
        <div
          className="grid grid-cols-[1fr_auto] gap-2"
          key={`${fieldPrefix}-${index}`}
        >
          <Input
            {...register(`${fieldPrefix}.${index}.value` as never)}
            placeholder={placeholder}
            variant="secondary"
          />
          <Button
            isDisabled={isBusy}
            isIconOnly
            onPress={() => onRemove(index)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Delete02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      ))}
    </div>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      className="w-full"
      onPress={onPress}
      size="sm"
      type="button"
      variant="tertiary"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={PlusSignIcon}
        size={14}
        strokeWidth={1.5}
      />
      {label}
    </Button>
  );
}

function appendKeyValueRow(
  rows: KeyValueRow[] | undefined,
  setRows: (rows: KeyValueRow[]) => void,
) {
  setRows([...(rows ?? []), { key: "", value: "" }]);
}

function appendValueRow(
  rows: ValueRow[] | undefined,
  setRows: (rows: ValueRow[]) => void,
) {
  setRows([...(rows ?? []), { value: "" }]);
}

function getFirstZodError(error: ZodError) {
  return error.issues[0]?.message ?? "Invalid MCP server configuration.";
}

export function McpServerForm({ mode, serverId }: McpServerFormProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<any>({
    defaultValues: createDefaultMcpServerFormValues(),
    resolver: zodResolver(mcpServerFormSchema) as never,
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
  const headers = (form.watch("headers") as KeyValueRow[] | undefined) ?? [];
  const headersFromEnv =
    (form.watch("headersFromEnv") as KeyValueRow[] | undefined) ?? [];
  const args = (form.watch("args") as ValueRow[] | undefined) ?? [];
  const envVars = (form.watch("envVars") as KeyValueRow[] | undefined) ?? [];
  const envPassthrough =
    (form.watch("envPassthrough") as ValueRow[] | undefined) ?? [];
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
            <div className="space-y-6">
              <TextField fullWidth name="url" type="url">
                <SectionLabel>URL</SectionLabel>
                <Input
                  {...form.register("url")}
                  placeholder="https://mcp.example.com/mcp"
                  variant="secondary"
                />
              </TextField>

              <TextField fullWidth name="bearerTokenEnvVar">
                <SectionLabel>Bearer token env var</SectionLabel>
                <Input
                  {...form.register("bearerTokenEnvVar")}
                  placeholder="MCP_BEARER_TOKEN"
                  variant="secondary"
                />
              </TextField>

              <div className="space-y-3">
                <SectionLabel>Headers</SectionLabel>
                <KeyValueRows
                  fieldPrefix="headers"
                  isBusy={isBusy}
                  onRemove={(index) =>
                    form.setValue(
                      "headers" as never,
                      headers.filter((_, i) => i !== index) as never,
                      { shouldDirty: true },
                    )
                  }
                  register={form.register}
                  rows={headers}
                />
                <AddButton
                  label="Add header"
                  onPress={() =>
                    appendKeyValueRow(headers, (rows) =>
                      form.setValue("headers" as never, rows as never, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
              </div>

              <div className="space-y-3">
                <SectionLabel>Headers from environment variables</SectionLabel>
                <KeyValueRows
                  fieldPrefix="headersFromEnv"
                  isBusy={isBusy}
                  onRemove={(index) =>
                    form.setValue(
                      "headersFromEnv" as never,
                      headersFromEnv.filter((_, i) => i !== index) as never,
                      { shouldDirty: true },
                    )
                  }
                  register={form.register}
                  rows={headersFromEnv}
                />
                <AddButton
                  label="Add variable"
                  onPress={() =>
                    appendKeyValueRow(headersFromEnv, (rows) =>
                      form.setValue("headersFromEnv" as never, rows as never, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <TextField fullWidth name="command">
                <SectionLabel>Command to launch</SectionLabel>
                <Input
                  {...form.register("command")}
                  placeholder="openai-dev-mcp serve-sqlite"
                  variant="secondary"
                />
              </TextField>

              <div className="space-y-3">
                <SectionLabel>Arguments</SectionLabel>
                <ValueRows
                  fieldPrefix="args"
                  isBusy={isBusy}
                  onRemove={(index) =>
                    form.setValue(
                      "args" as never,
                      args.filter((_, i) => i !== index) as never,
                      { shouldDirty: true },
                    )
                  }
                  placeholder="Argument"
                  register={form.register}
                  rows={args}
                />
                <AddButton
                  label="Add argument"
                  onPress={() =>
                    appendValueRow(args, (rows) =>
                      form.setValue("args" as never, rows as never, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
              </div>

              <div className="space-y-3">
                <SectionLabel>Environment variables</SectionLabel>
                <KeyValueRows
                  fieldPrefix="envVars"
                  isBusy={isBusy}
                  onRemove={(index) =>
                    form.setValue(
                      "envVars" as never,
                      envVars.filter((_, i) => i !== index) as never,
                      { shouldDirty: true },
                    )
                  }
                  register={form.register}
                  rows={envVars}
                />
                <AddButton
                  label="Add environment variable"
                  onPress={() =>
                    appendKeyValueRow(envVars, (rows) =>
                      form.setValue("envVars" as never, rows as never, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
              </div>

              <div className="space-y-3">
                <SectionLabel>Environment variable passthrough</SectionLabel>
                <ValueRows
                  fieldPrefix="envPassthrough"
                  isBusy={isBusy}
                  onRemove={(index) =>
                    form.setValue(
                      "envPassthrough" as never,
                      envPassthrough.filter((_, i) => i !== index) as never,
                      { shouldDirty: true },
                    )
                  }
                  placeholder="ENV_VAR_NAME"
                  register={form.register}
                  rows={envPassthrough}
                />
                <AddButton
                  label="Add variable"
                  onPress={() =>
                    appendValueRow(envPassthrough, (rows) =>
                      form.setValue("envPassthrough" as never, rows as never, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
              </div>

              <TextField fullWidth name="cwd">
                <SectionLabel>Working directory</SectionLabel>
                <Input
                  {...form.register("cwd")}
                  placeholder="~/code"
                  variant="secondary"
                />
              </TextField>
            </div>
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

"use client";

import { Button, Chip, Skeleton, Switch } from "@heroui/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getMcpCatalogIconComponent } from "@/components/settings/mcp-catalog-icons";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { MCP_SERVER_CATALOG, getMcpCatalogEntry } from "@/lib/mcp/catalog";
import {
  createCatalogMcpServerFormValues,
  normalizeMcpServerFormValues,
} from "@/schemas/mcp-server.schema";
import type { McpServerCatalogId } from "@/server/db/enums";
import { api, type RouterOutputs } from "@/trpc/react";

const STATUS_COLOR = {
  active: "success",
  disabled: "warning",
  invalid: "danger",
} as const;

const STATUS_LABEL = {
  active: "Active",
  disabled: "Disabled",
  invalid: "Needs attention",
} as const;

const TRANSPORT_LABEL = {
  http: "Streamable HTTP",
  stdio: "STDIO",
} as const;

type ListedServer = RouterOutputs["mcpServers"]["list"][number];

function McpSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-3 w-64 rounded-md" />
        </div>
      </section>
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-48 rounded-md" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-20 w-full rounded-xl" key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RecommendedServerRow({
  onAuthenticate,
  onInstall,
  onOpenSettings,
  onToggle,
  server,
}: {
  onAuthenticate: (serverId: string) => void;
  onInstall: (catalogId: McpServerCatalogId) => void;
  onOpenSettings: (serverId: string) => void;
  onToggle: (serverId: string, isEnabled: boolean) => void;
  server: (typeof MCP_SERVER_CATALOG)[number] & {
    installed: ListedServer | null;
  };
}) {
  const Icon = getMcpCatalogIconComponent(server.id);
  const installed = server.installed;
  const isInvalid = installed?.status === "invalid";
  const isInstalled = Boolean(installed);
  const installedServer = installed ?? null;

  return (
    <section className="border-separator flex flex-col gap-4 border-b px-4 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="border-separator bg-background flex size-12 shrink-0 items-center justify-center rounded-xl border">
          <Icon className="size-7 shrink-0" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-foreground text-sm font-semibold">
              {server.name}
              <span className="text-muted font-normal">
                {" "}
                by {server.vendor}
              </span>
            </p>
            {installed ? (
              <Chip
                color={STATUS_COLOR[installed.status]}
                size="sm"
                variant="soft"
              >
                {STATUS_LABEL[installed.status]}
              </Chip>
            ) : null}
          </div>
          <p className="text-muted mt-1 text-sm">{server.description}</p>
          {isInvalid ? (
            <p className="text-danger-soft-foreground mt-2 text-xs">
              {installed?.errorMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end md:self-auto">
        {!isInstalled ? (
          <Button
            onPress={() => onInstall(server.id)}
            size="sm"
            variant="secondary"
          >
            {server.installLabel ?? "Install"}
          </Button>
        ) : installedServer ? (
          <>
            {server.transport === "http" && server.requiresAuthentication ? (
              <Button
                onPress={() => onAuthenticate(installedServer.id)}
                size="sm"
                variant="secondary"
              >
                Authenticate
              </Button>
            ) : null}
            <Button
              isIconOnly
              onPress={() => onOpenSettings(installedServer.id)}
              size="sm"
              variant="ghost"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Settings05Icon}
                size={16}
                strokeWidth={1.5}
              />
            </Button>
            <Switch
              isDisabled={isInvalid}
              isSelected={installedServer.status === "active"}
              onChange={() =>
                onToggle(
                  installedServer.id,
                  installedServer.status !== "active",
                )
              }
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function McpSettingsPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const [mutationError, setMutationError] = useState("");
  const servers = api.mcpServers.list.useQuery();

  const toggle = api.mcpServers.toggle.useMutation({
    onMutate: async ({ id, isEnabled }) => {
      setMutationError("");
      const previous = utils.mcpServers.list.getData();
      utils.mcpServers.list.setData(undefined, (current) =>
        current?.map((server) =>
          server.id === id && server.status !== "invalid"
            ? {
                ...server,
                isEnabled,
                status: isEnabled ? "active" : "disabled",
              }
            : server,
        ),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      setMutationError(error.message);
      utils.mcpServers.list.setData(undefined, context?.previous ?? []);
    },
    onSettled: async () => {
      await utils.mcpServers.list.invalidate();
    },
  });

  const install = api.mcpServers.upsert.useMutation({
    onSuccess: async (server) => {
      setMutationError("");
      await utils.mcpServers.list.invalidate();
      router.push(`/settings/mcp/${server.id}`);
    },
    onError: (error) => {
      setMutationError(error.message);
    },
  });

  const beginOAuth = api.mcpServers.beginOAuth.useMutation({
    onError: (error) => {
      setMutationError(error.message);
    },
    onSuccess: async (result) => {
      setMutationError("");

      if (result.status === "authorized") {
        await utils.mcpServers.list.invalidate();
        return;
      }

      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const channel = new BroadcastChannel("sentinel-mcp-oauth");
    const onMessage = (event: MessageEvent<{ success?: boolean }>) => {
      if (!event.data?.success) {
        return;
      }

      void utils.mcpServers.list.invalidate();
    };

    channel.addEventListener("message", onMessage);

    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [utils.mcpServers.list]);

  const customServers =
    servers.data?.filter((server) => !server.catalogId) ?? [];
  const installedCatalogServers = new Map(
    (servers.data ?? [])
      .filter((server) => Boolean(server.catalogId))
      .map((server) => [server.catalogId as McpServerCatalogId, server]),
  );

  const recommendedServers = MCP_SERVER_CATALOG.map((server) => ({
    ...server,
    installed: installedCatalogServers.get(server.id) ?? null,
  }));

  const handleInstall = async (catalogId: McpServerCatalogId) => {
    setMutationError("");
    const catalog = getMcpCatalogEntry(catalogId);

    if (!catalog) {
      setMutationError("Unknown MCP catalog entry.");
      return;
    }

    const values = createCatalogMcpServerFormValues(catalogId);
    values.isEnabled = false;

    await install.mutateAsync(
      normalizeMcpServerFormValues({
        ...values,
        catalogId,
        name: catalog.name,
      }),
    );
  };

  const handleAuthenticate = async (serverId: string) => {
    setMutationError("");
    await beginOAuth.mutateAsync({ id: serverId });
  };

  return (
    <SettingsPageWrapper
      subtitle={
        <>
          Connect external tools and data sources.{" "}
          <Link
            className="text-foreground underline"
            href="https://modelcontextprotocol.io/docs/getting-started/intro"
            rel="noreferrer"
            target="_blank"
          >
            Learn more.
          </Link>
        </>
      }
      title="MCP servers"
    >
      {servers.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {servers.error.message}
        </p>
      ) : null}

      {mutationError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {mutationError}
        </p>
      ) : null}

      {servers.isPending && !servers.data ? <McpSettingsSkeleton /> : null}

      {!servers.isPending ? (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-foreground text-lg font-medium">
                Custom servers
              </h2>
              {customServers.length ? (
                <Button
                  onPress={() => router.push("/settings/mcp/new")}
                  size="sm"
                  variant="secondary"
                >
                  Add server
                </Button>
              ) : null}
            </div>

            {customServers.length ? (
              <div className="border-separator bg-surface rounded-xl border">
                {customServers.map((server) => (
                  <section
                    className="border-separator flex flex-col gap-3 border-b px-4 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between"
                    key={server.id}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground text-sm font-medium">
                          {server.name}
                        </span>
                        <Chip
                          color={STATUS_COLOR[server.status]}
                          size="sm"
                          variant="soft"
                        >
                          {STATUS_LABEL[server.status]}
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {TRANSPORT_LABEL[server.transport]}
                        </Chip>
                      </div>
                      <p className="text-muted mt-1 text-xs">
                        {server.status === "invalid"
                          ? server.errorMessage
                          : server.transport === "http"
                            ? "Remote MCP server over Streamable HTTP."
                            : "Local MCP server launched over stdio."}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {server.status !== "invalid" ? (
                        <Switch
                          isDisabled={toggle.isPending}
                          isSelected={server.status === "active"}
                          onChange={() =>
                            toggle.mutate({
                              id: server.id,
                              isEnabled: server.status !== "active",
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
                          router.push(`/settings/mcp/${server.id}`)
                        }
                        size="sm"
                        variant={
                          server.status === "invalid" ? "primary" : "secondary"
                        }
                      >
                        Edit
                      </Button>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <section className="border-separator bg-surface rounded-xl border p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-foreground text-base font-medium">
                      No custom MCP servers connected
                    </h3>
                    <p className="text-muted text-sm">
                      Add a Streamable HTTP or STDIO server to expose MCP tools
                      in chat threads.
                    </p>
                  </div>
                  <Button
                    onPress={() => router.push("/settings/mcp/new")}
                    size="sm"
                  >
                    Add server
                  </Button>
                </div>
              </section>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-foreground text-lg font-medium">
                Recommended servers
              </h2>
            </div>

            <div className="border-separator bg-surface rounded-xl border">
              {recommendedServers.map((server) => (
                <RecommendedServerRow
                  key={server.id}
                  onAuthenticate={(serverId) =>
                    void handleAuthenticate(serverId)
                  }
                  onInstall={(catalogId) => void handleInstall(catalogId)}
                  onOpenSettings={(serverId) =>
                    router.push(`/settings/mcp/${serverId}`)
                  }
                  onToggle={(serverId, isEnabled) =>
                    toggle.mutate({ id: serverId, isEnabled })
                  }
                  server={server}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </SettingsPageWrapper>
  );
}

"use client";

import { Button, Chip, Spinner, Switch } from "@heroui/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sileo } from "sileo";

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

type ListedServer = RouterOutputs["mcpServers"]["list"][number];

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

function CustomServerCell({
  onEdit,
  onToggle,
  server,
  isToggling,
}: {
  onEdit: (serverId: string) => void;
  onToggle: (serverId: string, isEnabled: boolean) => void;
  server: ListedServer;
  isToggling: boolean;
}) {
  return (
    <div className="border-separator/20 flex items-center gap-2.5 rounded-2xl border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[13px] font-medium leading-tight">
            {server.name}
          </span>
          <Chip color={STATUS_COLOR[server.status]} size="sm" variant="soft">
            {STATUS_LABEL[server.status]}
          </Chip>
        </div>
        <p className="text-muted mt-0.5 truncate text-[11px]">
          {server.status === "invalid"
            ? server.errorMessage
            : server.transport === "http"
              ? "Streamable HTTP"
              : "STDIO"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {server.status !== "invalid" ? (
          <Switch
            isDisabled={isToggling}
            isSelected={server.status === "active"}
            onChange={() => onToggle(server.id, server.status !== "active")}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        ) : null}
        <Button
          onPress={() => onEdit(server.id)}
          size="sm"
          variant={server.status === "invalid" ? "primary" : "secondary"}
          className="h-7 min-w-0 px-2.5 text-xs"
        >
          Edit
        </Button>
      </div>
    </div>
  );
}

function RecommendedServerCell({
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
    <div className="border-separator/20 flex items-center gap-2.5 rounded-2xl border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-hover">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background">
        <Icon className="size-5 shrink-0" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[13px] font-medium leading-tight">
            {server.name}
          </span>
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
        <p className="text-muted mt-0.5 truncate text-[11px]">
          {isInvalid ? installed?.errorMessage : server.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!isInstalled ? (
          <Button
            onPress={() => onInstall(server.id)}
            size="sm"
            variant="secondary"
            className="h-7 min-w-0 px-2.5 text-xs"
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
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                Auth
              </Button>
            ) : null}
            <Button
              isIconOnly
              onPress={() => onOpenSettings(installedServer.id)}
              size="sm"
              variant="ghost"
              className="h-7 w-7 min-w-0"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Settings05Icon}
                size={14}
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
    </div>
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
      sileo.error({ description: error.message });
    },
    onSettled: async () => {
      await utils.mcpServers.list.invalidate();
    },
  });

  const install = api.mcpServers.upsert.useMutation({
    onSuccess: async (server) => {
      setMutationError("");
      await utils.mcpServers.list.invalidate();
      sileo.success({ description: "MCP server installed." });
      router.replace(`/settings/mcp/${server.id}`);
    },
    onError: (error) => {
      setMutationError(error.message);
      sileo.error({ description: error.message });
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

  const errorMessage = servers.error?.message ?? mutationError;

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
      {errorMessage ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {errorMessage}
        </p>
      ) : null}

      {servers.isPending && !servers.data ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1.5 pb-0.5">
              <h2 className="text-foreground text-sm font-medium">
                Custom servers
              </h2>
              <Button
                onPress={() => router.replace("/settings/mcp/new")}
                size="sm"
                variant="primary"
                className="h-7 px-2 text-xs"
              >
                Add server
              </Button>
            </div>

            {customServers.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {customServers.map((server) => (
                  <CustomServerCell
                    isToggling={toggle.isPending}
                    key={server.id}
                    onEdit={(serverId) =>
                      router.replace(`/settings/mcp/${serverId}`)
                    }
                    onToggle={(serverId, isEnabled) =>
                      toggle.mutate({ id: serverId, isEnabled })
                    }
                    server={server}
                  />
                ))}
              </div>
            ) : (
              <div className="border-separator/20 rounded-2xl border bg-surface px-4 py-6 text-center">
                <p className="text-foreground text-sm font-medium">
                  No custom MCP servers
                </p>
                <p className="text-muted mt-1 text-xs">
                  Add a Streamable HTTP or STDIO server to expose MCP tools in
                  chat.
                </p>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-1.5">
            <div className="px-1.5 pb-0.5">
              <h2 className="text-foreground text-sm font-medium">
                Recommended
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {recommendedServers.map((server) => (
                <RecommendedServerCell
                  key={server.id}
                  onAuthenticate={(serverId) =>
                    void handleAuthenticate(serverId)
                  }
                  onInstall={(catalogId) => void handleInstall(catalogId)}
                  onOpenSettings={(serverId) =>
                    router.replace(`/settings/mcp/${serverId}`)
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
      )}
    </SettingsPageWrapper>
  );
}

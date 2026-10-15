"use client";

import {
  AlertDialog,
  Button,
  Input,
  Modal,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { useMemo, useState } from "react";
import { sileo } from "sileo";

import { EngineIcon } from "@/components/engines/descriptors";
import type {
  AcpRegistryAgentView,
  AcpRegistryDistributionKind,
} from "@/lib/ai/chat/engines/acp/registry/schema";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import {
  defaultRegistryDistribution,
  describeRegistryDistribution,
  describeRegistryInstall,
  filterRegistryAgents,
  registryDistributionLabel,
  registryNativeEngineNote,
} from "./acp-registry-helpers";
import { useInvalidateEngineInstances } from "./engine-instance-dialog";

// Settings → Engines: the ACP Registry. Opening the browser loads the
// cached index (refetched by the server when it is older than 6 hours);
// Refresh fetches it now. Installing always goes through a confirmation
// that names the agent's source, authors and what will run.

type InstallTarget = {
  agent: AcpRegistryAgentView;
  distribution: AcpRegistryDistributionKind;
};

function formatFetchedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function AgentRow({
  agent,
  isBusy,
  onInstall,
}: {
  agent: AcpRegistryAgentView;
  isBusy: boolean;
  onInstall: (agent: AcpRegistryAgentView) => void;
}) {
  const installable = defaultRegistryDistribution(agent) !== null;
  const native = registryNativeEngineNote(agent);
  return (
    <li className="border-border flex gap-3 rounded-xl border px-3 py-2.5">
      <EngineIcon
        className="mt-0.5 h-5 w-5 shrink-0"
        driver="acp"
        iconUrl={agent.iconUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground text-[13px] font-medium">
            {agent.name}
          </span>
          <span className="text-muted font-mono text-[11px]">
            {agent.version}
          </span>
          {agent.featured ? (
            <span className="bg-accent-soft text-accent-soft-foreground rounded-full px-1.5 text-[10px]">
              Featured
            </span>
          ) : null}
          {agent.instanceIds.length > 0 ? (
            <span className="bg-success-soft text-success-soft-foreground rounded-full px-1.5 text-[10px]">
              Added
            </span>
          ) : null}
        </div>
        {agent.description ? (
          <p className="text-muted text-xs">{agent.description}</p>
        ) : null}
        <p className="text-muted text-[11px]">
          {[
            agent.authors.length > 0 ? agent.authors.join(", ") : null,
            agent.license,
          ]
            .filter(Boolean)
            .join(" · ")}
          {agent.repository ? (
            <>
              {agent.authors.length > 0 || agent.license ? " · " : null}
              <a
                className="underline"
                href={agent.repository}
                rel="noreferrer noopener"
                target="_blank"
              >
                Source
              </a>
            </>
          ) : null}
        </p>
        <ul className="text-muted text-[11px]">
          {agent.distributions.map((entry) => (
            <li
              className={entry.advisory ? "text-warning" : undefined}
              key={entry.kind}
            >
              {describeRegistryDistribution(entry)}
            </li>
          ))}
        </ul>
        {native ? <p className="text-muted text-[11px]">{native}</p> : null}
      </div>
      <Button
        className="h-7 shrink-0 self-start px-2.5 text-xs"
        isDisabled={!installable || isBusy}
        onPress={() => onInstall(agent)}
        size="sm"
        variant={agent.instanceIds.length > 0 ? "tertiary" : "secondary"}
      >
        {agent.instanceIds.length > 0 ? "Reinstall" : "Install"}
      </Button>
    </li>
  );
}

function InstallConfirmation({
  isPending,
  onCancel,
  onConfirm,
  onPickDistribution,
  target,
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onPickDistribution: (kind: AcpRegistryDistributionKind) => void;
  target: InstallTarget | null;
}) {
  const text = target
    ? describeRegistryInstall(target.agent, target.distribution)
    : null;
  const choices =
    target?.agent.distributions.filter((entry) => entry.available) ?? [];
  return (
    <AlertDialog.Backdrop
      isOpen={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog className="sm:max-w-[460px]">
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status="warning" />
            <AlertDialog.Heading>{text?.title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="flex flex-col gap-2">
            {choices.length > 1 ? (
              <div
                aria-label="How to install"
                className="flex gap-1.5"
                role="radiogroup"
              >
                {choices.map((entry) => {
                  const selected = entry.kind === target?.distribution;
                  return (
                    <button
                      aria-checked={selected}
                      className={`rounded-lg border px-2 py-0.5 text-[11px] ${
                        selected
                          ? "border-foreground text-foreground"
                          : "border-border text-muted"
                      }`}
                      key={entry.kind}
                      onClick={() => onPickDistribution(entry.kind)}
                      role="radio"
                      type="button"
                    >
                      {registryDistributionLabel(entry.kind)}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {text?.body.map((line) => (
              <p className="text-foreground text-sm break-words" key={line}>
                {line}
              </p>
            ))}
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button onPress={onCancel} variant="tertiary">
              Cancel
            </Button>
            <Button isPending={isPending} onPress={onConfirm}>
              {text?.confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const listQuery = api.engines.acpRegistry.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1_000,
  });
  const refreshMutation = api.engines.acpRegistry.refresh.useMutation({
    onSuccess: (data) =>
      utils.engines.acpRegistry.list.setData(undefined, data),
  });
  const installMutation = api.engines.acpRegistry.install.useMutation();
  const invalidate = useInvalidateEngineInstances();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<InstallTarget | null>(null);

  const catalog = refreshMutation.data ?? listQuery.data;
  const agents = useMemo(
    () => filterRegistryAgents(catalog?.agents ?? [], query),
    [catalog?.agents, query],
  );
  const fetchedAt = formatFetchedAt(catalog?.fetchedAt ?? null);

  const install = async () => {
    if (!target) return;
    const { agent, distribution } = target;
    try {
      await installMutation.mutateAsync({ agentId: agent.id, distribution });
      setTarget(null);
      await Promise.all([
        invalidate(),
        utils.engines.acpRegistry.list.invalidate(),
      ]);
      sileo.success({
        description: `Installing ${agent.name}. Its progress shows on its card in Settings → Engines.`,
      });
      onClose();
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, `Unable to install ${agent.name}.`),
      });
    }
  };

  return (
    <>
      <Modal.Header className="items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Modal.Heading className="text-base">ACP Registry</Modal.Heading>
          <p className="text-muted text-xs">
            Coding agents that speak the Agent Client Protocol. Each one you
            install becomes an engine instance.
          </p>
        </div>
        <Modal.CloseTrigger />
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-2 p-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Search agents"
            className="flex-1 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents"
            value={query}
            variant="secondary"
          />
          <Button
            className="h-8 px-2.5 text-xs"
            isPending={refreshMutation.isPending}
            onPress={() => refreshMutation.mutate()}
            size="sm"
            variant="tertiary"
          >
            Refresh
          </Button>
        </div>
        {catalog?.fetchError ? (
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2 text-xs">
            {catalog.fetchError}
          </p>
        ) : null}
        {listQuery.isPending && !catalog ? (
          <div className="flex justify-center py-12">
            <Spinner size="sm" />
          </div>
        ) : agents.length === 0 ? (
          <p className="text-muted px-1 py-8 text-center text-xs">
            {catalog?.agents.length
              ? "No agent matches your search."
              : "The registry has not been loaded yet. Press Refresh to load it."}
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
            {agents.map((agent) => (
              <AgentRow
                agent={agent}
                isBusy={installMutation.isPending}
                key={agent.id}
                onInstall={(next) => {
                  const distribution = defaultRegistryDistribution(next);
                  if (distribution) setTarget({ agent: next, distribution });
                }}
              />
            ))}
          </ul>
        )}
        {fetchedAt ? (
          <p className="text-muted px-1 text-[11px]">
            Registry {catalog?.registryVersion ?? ""} loaded {fetchedAt}.
          </p>
        ) : null}
      </Modal.Body>
      <InstallConfirmation
        isPending={installMutation.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => void install()}
        onPickDistribution={(distribution) =>
          setTarget((current) =>
            current ? { ...current, distribution } : null,
          )
        }
        target={target}
      />
    </>
  );
}

/** The registry browser dialog. */
export function AcpRegistryBrowser({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const state = useOverlayState({
    isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });
  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog>
            {isOpen ? <BrowserBody onClose={onClose} /> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** Settings → Engines entry point for registry agents. */
export function AcpRegistrySection({ onBrowse }: { onBrowse: () => void }) {
  return (
    <section className="border-border flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <EngineIcon className="mt-0.5 h-4 w-4 shrink-0" driver="acp" />
        <div className="flex min-w-0 flex-col">
          <h2 className="text-foreground text-[13px] font-medium">
            ACP Registry
          </h2>
          <p className="text-muted text-[11px]">
            Add Gemini CLI, Devin, Goose and other agents as engines.
          </p>
        </div>
      </div>
      <Button
        className="h-7 shrink-0 px-2.5 text-xs"
        onPress={onBrowse}
        size="sm"
        variant="secondary"
      >
        Browse agents
      </Button>
    </section>
  );
}

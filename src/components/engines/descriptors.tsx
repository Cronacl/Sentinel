"use client";

import type { ComponentType } from "react";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CopilotIcon } from "@/components/icons/copilot-icon";
import {
  CursorOpenIcon,
  OpenCodeIcon,
} from "@/components/icons/open-target-icons";
import { ProviderIcon } from "@/components/icons/provider-icon";
import type { BuiltinDriverKind } from "@/lib/ai/chat/engines/catalog";

// Client descriptors: how the UI presents each driver kind (icon, tool
// renderer family). Server drivers and the client-safe catalog carry
// everything else. Unknown kinds (a newer build's rows, an unmerged fork's)
// get the generic descriptor and never crash a picker or a card.

type EngineIconComponent = ComponentType<{ className?: string }>;

export type EngineRendererFamily =
  "acp" | "claude" | "codex" | "copilot" | "external" | "pi";

export type EngineClientDescriptor = {
  Icon: EngineIconComponent;
  kind: string;
  rendererFamily: EngineRendererFamily | null;
};

function GenericEngineIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      className={className}
      icon={DashboardSquare01Icon}
      strokeWidth={1.8}
    />
  );
}

function CodexIcon({ className }: { className?: string }) {
  return <ProviderIcon className={className} provider="openai" />;
}

export const ENGINE_CLIENT_DESCRIPTORS = {
  sentinel: { Icon: GenericEngineIcon, kind: "sentinel", rendererFamily: null },
  codex: { Icon: CodexIcon, kind: "codex", rendererFamily: "codex" },
  claude: { Icon: ClaudeIcon, kind: "claude", rendererFamily: "claude" },
  copilot: { Icon: CopilotIcon, kind: "copilot", rendererFamily: "copilot" },
  cursor: { Icon: CursorOpenIcon, kind: "cursor", rendererFamily: "external" },
  opencode: {
    Icon: OpenCodeIcon,
    kind: "opencode",
    rendererFamily: "external",
  },
  grok: { Icon: GenericEngineIcon, kind: "grok", rendererFamily: "acp" },
  antigravity: {
    Icon: GenericEngineIcon,
    kind: "antigravity",
    rendererFamily: "acp",
  },
  pi: { Icon: GenericEngineIcon, kind: "pi", rendererFamily: "pi" },
  acp: { Icon: GenericEngineIcon, kind: "acp", rendererFamily: "acp" },
} as const satisfies Record<BuiltinDriverKind, EngineClientDescriptor>;

export function getEngineClientDescriptor(
  kind: string | null | undefined,
): EngineClientDescriptor {
  if (kind && Object.hasOwn(ENGINE_CLIENT_DESCRIPTORS, kind)) {
    return ENGINE_CLIENT_DESCRIPTORS[kind as BuiltinDriverKind];
  }
  return { Icon: GenericEngineIcon, kind: kind ?? "", rendererFamily: null };
}

/**
 * Registry agents bring their own icon; only the ACP registry CDN is
 * trusted to serve it (t3code acpRegistry.ts).
 */
const TRUSTED_ENGINE_ICON_URL =
  /^https:\/\/cdn\.agentclientprotocol\.com\/registry\/v1\/latest\/[a-z0-9-]+\.svg$/;

export function isTrustedEngineIconUrl(url: string | null | undefined) {
  return typeof url === "string" && TRUSTED_ENGINE_ICON_URL.test(url);
}

export function EngineIcon({
  className,
  driver,
  iconUrl,
}: {
  className?: string;
  driver: string | null | undefined;
  iconUrl?: string | null;
}) {
  if (isTrustedEngineIconUrl(iconUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote SVG from the registry CDN
      <img alt="" aria-hidden className={className} src={iconUrl!} />
    );
  }

  const { Icon } = getEngineClientDescriptor(driver);
  return <Icon className={className} />;
}

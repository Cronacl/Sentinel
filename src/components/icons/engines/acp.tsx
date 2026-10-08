"use client";

import { ConnectIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// ACP Registry engine icon, for agents without a trusted registry icon
// (EngineIcon prefers the agent's own iconUrl). A stock glyph the ACP
// Registry lane may replace; engines/descriptors.tsx points at it.
export function AcpEngineIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon className={className} icon={ConnectIcon} strokeWidth={1.8} />
  );
}

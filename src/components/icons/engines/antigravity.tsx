"use client";

import { GravityIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Antigravity engine icon. A stock glyph until the Antigravity lane brings the agent's own
// mark; engines/descriptors.tsx points at this component.
export function AntigravityEngineIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon className={className} icon={GravityIcon} strokeWidth={1.8} />
  );
}

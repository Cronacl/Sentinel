"use client";

import { GrokIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Grok engine icon. A stock glyph until the Grok lane brings the agent's own
// mark; engines/descriptors.tsx points at this component.
export function GrokEngineIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon className={className} icon={GrokIcon} strokeWidth={1.8} />
  );
}

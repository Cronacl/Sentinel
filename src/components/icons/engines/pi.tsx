"use client";

import { PiIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Pi engine icon. A stock glyph until the Pi lane brings the agent's own
// mark; engines/descriptors.tsx points at this component.
export function PiEngineIcon({ className }: { className?: string }) {
  return (
    <HugeiconsIcon className={className} icon={PiIcon} strokeWidth={1.8} />
  );
}

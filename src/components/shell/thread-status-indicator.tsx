"use client";

import { Spinner } from "@heroui/react";

export type ThreadStatusValue = "idle" | "streaming" | "awaiting_approval";

export function ThreadStatusIndicator({
  status,
  size = "default",
}: {
  status: ThreadStatusValue;
  size?: "compact" | "default";
}) {
  const isCompact = size === "compact";

  if (status === "streaming") {
    return (
      <Spinner
        className={isCompact ? "size-2.5 min-w-2.5" : "size-3 min-w-3"}
        color="current"
        size="sm"
      />
    );
  }

  if (status === "awaiting_approval") {
    return (
      <span
        className={`relative flex shrink-0 ${
          isCompact ? "h-2 w-2" : "h-2.5 w-2.5"
        }`}
        title="Awaiting approval"
      >
        <span
          className={`relative inline-flex rounded-full ${
            isCompact ? "h-2 w-2 bg-warning/50" : "h-2.5 w-2.5 bg-accent"
          }`}
        />
      </span>
    );
  }

  return null;
}

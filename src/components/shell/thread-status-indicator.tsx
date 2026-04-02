"use client";

import { Spinner } from "@heroui/react";

export type ThreadStatusValue = "idle" | "streaming" | "awaiting_approval";

export function ThreadStatusIndicator({
  status,
}: {
  status: ThreadStatusValue;
}) {
  if (status === "streaming") {
    return <Spinner className="size-3 min-w-3" color="current" size="sm" />;
  }

  if (status === "awaiting_approval") {
    return (
      <span
        className="relative flex h-2.5 w-2.5 shrink-0"
        title="Awaiting approval"
      >
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }

  return null;
}

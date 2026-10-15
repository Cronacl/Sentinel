"use client";

import { Chip } from "@heroui/react";

import { getAdvisoryBadges } from "@/components/engines/maintenance-status";
import type { EngineSnapshot } from "@/lib/ai/chat/engines/contract";

/** Version and compatibility advisories for the instance card header. */
export function EngineAdvisoryBadges({
  snapshot,
}: {
  snapshot: EngineSnapshot;
}) {
  const badges = getAdvisoryBadges(snapshot);
  if (badges.length === 0) {
    return null;
  }

  return (
    <>
      {badges.map((badge) => (
        <Chip color={badge.color} key={badge.label} size="sm" variant="soft">
          {badge.label}
        </Chip>
      ))}
    </>
  );
}

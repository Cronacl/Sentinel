"use client";

import { Button } from "@heroui/react";
import { LayoutLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useShell } from "./shell-context";

export function SidebarToggle() {
  const { toggleLeftSidebar } = useShell();

  return (
    <Button
      aria-label="Toggle sidebar"
      isIconOnly
      onPress={toggleLeftSidebar}
      size="sm"
      variant="ghost"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={LayoutLeftIcon}
        size={18}
        strokeWidth={1.5}
      />
    </Button>
  );
}

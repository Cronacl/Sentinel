"use client";

import { Button, cn } from "@heroui/react";
import { LayoutLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useShell } from "./shell-context";

export function SidebarToggle({
  className = "border-none",
}: {
  className?: string;
}) {
  const { toggleLeftSidebar } = useShell();

  return (
    <Button
      aria-label="Toggle sidebar"
      className={cn(className, "h-8 w-8 rounded-xl")}
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

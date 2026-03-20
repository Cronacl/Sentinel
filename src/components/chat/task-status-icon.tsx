"use client";

import type { IconSvgElement } from "@hugeicons/react";

import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Forward01Icon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type TaskStatusIconStatus =
  | "blocked"
  | "canceled"
  | "completed"
  | "in_progress"
  | "pending"
  | "skipped";

const TASK_STATUS_ICONS: Record<TaskStatusIconStatus, IconSvgElement> = {
  blocked: CancelCircleIcon,
  canceled: CancelCircleIcon,
  completed: CheckmarkCircle02Icon,
  in_progress: PlayCircleIcon,
  pending: Clock01Icon,
  skipped: Forward01Icon,
};

function getTaskStatusIcon(status?: string): IconSvgElement {
  if (!status) return TASK_STATUS_ICONS.pending;
  return (
    TASK_STATUS_ICONS[status as TaskStatusIconStatus] ??
    TASK_STATUS_ICONS.pending
  );
}

export function TaskStatusIcon({
  className,
  size = 14,
  status,
}: {
  className?: string;
  size?: number;
  status?: string;
}) {
  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={getTaskStatusIcon(status)}
      size={size}
    />
  );
}

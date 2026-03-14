"use client";

import { Icon } from "@iconify/react";

type TaskStatusIconStatus =
  | "blocked"
  | "canceled"
  | "completed"
  | "in_progress"
  | "pending"
  | "skipped";

const TASK_STATUS_ICONS: Record<TaskStatusIconStatus, string> = {
  blocked: "solar:close-circle-linear",
  canceled: "solar:close-circle-linear",
  completed: "solar:check-circle-bold",
  in_progress: "solar:play-circle-bold",
  pending: "solar:clock-circle-linear",
  skipped: "solar:skip-next-linear",
};

export function getTaskStatusIconName(status?: string) {
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
    <Icon
      className={className}
      height={size}
      icon={getTaskStatusIconName(status)}
      width={size}
    />
  );
}

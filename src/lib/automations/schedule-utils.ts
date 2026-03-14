import type { AutomationScheduleType } from "@/server/db/enums";

export function buildCronExpression(automation: {
  scheduleType: AutomationScheduleType;
  scheduleDayOfWeek: number | null;
  scheduleTime: string | null;
  scheduleCron: string | null;
}): string {
  const { scheduleType, scheduleDayOfWeek, scheduleTime, scheduleCron } =
    automation;

  switch (scheduleType) {
    case "hourly":
      return "@hourly";

    case "daily": {
      if (!scheduleTime) return "0 0 9 * * *";
      const [hour, minute] = scheduleTime.split(":").map(Number);
      return `0 ${minute} ${hour} * * *`;
    }

    case "weekly": {
      const day = scheduleDayOfWeek ?? 1;
      if (!scheduleTime) return `0 0 9 * * ${day}`;
      const [hour, minute] = scheduleTime.split(":").map(Number);
      return `0 ${minute} ${hour} * * ${day}`;
    }

    case "weekdays": {
      if (!scheduleTime) return "0 0 9 * * 1-5";
      const [hour, minute] = scheduleTime.split(":").map(Number);
      return `0 ${minute} ${hour} * * 1-5`;
    }

    case "custom":
      return scheduleCron || "0 0 9 * * *";

    default:
      return "0 0 9 * * *";
  }
}

export function computeNextRunAt(automation: {
  scheduleType: AutomationScheduleType;
  scheduleDayOfWeek: number | null;
  scheduleTime: string | null;
  scheduleCron: string | null;
}): Date | null {
  try {
    const { Cron } = require("cronbake") as typeof import("cronbake");
    const cronExpr = buildCronExpression(automation);
    return Cron.getNext(cronExpr);
  } catch {
    return null;
  }
}

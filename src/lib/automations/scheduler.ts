import Baker, { FilePersistenceProvider } from "cronbake";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";

import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { automations } from "@/server/db/schema";
import type { AutomationScheduleType } from "@/server/db/enums";
import { buildCronExpression } from "./schedule-utils";
import { executeAutomationRun } from "./runner";

const log = createLogger("Automations");
const bakerLogger = {
  debug() {},
  error(message: unknown, ...args: unknown[]) {
    log.error(String(message), ...args);
  },
  info() {},
  warn(message: unknown, ...args: unknown[]) {
    log.warn(String(message), ...args);
  },
} as const;

function getStatePath(): string {
  const sentinelDir =
    process.env.SENTINEL_DB_PATH?.trim()
      ? path.dirname(process.env.SENTINEL_DB_PATH.trim())
      : path.join(os.homedir(), ".sentinel");
  return path.join(sentinelDir, "automations-state.json");
}

let bakerInstance: ReturnType<typeof Baker.create> | null = null;
let schedulerInitPromise: Promise<void> | null = null;
let schedulerInitialized = false;

function getBaker() {
  if (!bakerInstance) {
    bakerInstance = Baker.create({
      logger: bakerLogger,
      persistence: {
        enabled: true,
        strategy: "file",
        provider: new FilePersistenceProvider(getStatePath()),
        autoRestore: true,
      },
      enableMetrics: true,
      onError: (error, jobName) => {
        log.error(
          `Job ${jobName} failed: ${error instanceof Error ? error.message : error}`,
        );
      },
    });
  }
  return bakerInstance;
}

export async function initAutomationScheduler() {
  if (schedulerInitialized) {
    return;
  }

  if (!schedulerInitPromise) {
    schedulerInitPromise = (async () => {
      const baker = getBaker();
      await baker.ready();

      const activeAutomations = await db.query.automations.findMany({
        where: eq(automations.status, "active"),
      });

      const existingJobs = new Set(baker.getJobNames());

      for (const automation of activeAutomations) {
        if (!existingJobs.has(automation.id)) {
          scheduleAutomation(automation);
        }
      }

      schedulerInitialized = true;
    })().catch((error) => {
      schedulerInitPromise = null;
      throw error;
    });
  }

  await schedulerInitPromise;
}

export function scheduleAutomation(automation: {
  id: string;
  title: string;
  scheduleType: AutomationScheduleType;
  scheduleDayOfWeek: number | null;
  scheduleTime: string | null;
  scheduleCron: string | null;
}) {
  const baker = getBaker();
  const cronExpr = buildCronExpression(automation);

  const existingJobs = new Set(baker.getJobNames());
  if (existingJobs.has(automation.id)) {
    baker.remove(automation.id);
  }

  baker.add({
    name: automation.id,
    cron: cronExpr,
    persist: true,
    overrunProtection: true,
    callback: async () => {
      await executeAutomationRun(automation.id);
    },
    onError: (error) => {
      log.error(
        `"${automation.title}" failed: ${error instanceof Error ? error.message : error}`,
      );
    },
  });

  baker.bake(automation.id);
}

export function unscheduleAutomation(automationId: string) {
  const baker = getBaker();
  const existingJobs = new Set(baker.getJobNames());
  if (existingJobs.has(automationId)) {
    baker.remove(automationId);
  }
}

export function pauseAutomation(automationId: string) {
  const baker = getBaker();
  const existingJobs = new Set(baker.getJobNames());
  if (existingJobs.has(automationId)) {
    baker.pause(automationId);
  }
}

export function resumeAutomation(automationId: string) {
  const baker = getBaker();
  const existingJobs = new Set(baker.getJobNames());
  if (existingJobs.has(automationId)) {
    baker.resume(automationId);
  }
}

export function getNextRun(automationId: string): Date | null {
  const baker = getBaker();
  try {
    return baker.nextExecution(automationId);
  } catch {
    return null;
  }
}

export function getLastRun(automationId: string): Date | null {
  const baker = getBaker();
  try {
    return baker.lastExecution(automationId);
  } catch {
    return null;
  }
}

export function getJobMetrics(automationId: string) {
  const baker = getBaker();
  try {
    return baker.getMetrics(automationId);
  } catch {
    return null;
  }
}

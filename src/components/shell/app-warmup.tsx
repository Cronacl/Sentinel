"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { scheduleIdleTask } from "@/lib/browser/idle-task";
import { preflightMicrophonePermissionOnStartup } from "@/lib/desktop/permissions";
import { api } from "@/trpc/react";

import {
  isStaticAppWarmupRoute,
  STATIC_APP_WARMUP_ROUTES,
} from "./app-warmup-config";

let hasStartedAppWarmup = false;

export function AppWarmupCoordinator() {
  const router = useRouter();
  const utils = api.useUtils();

  useEffect(() => {
    if (hasStartedAppWarmup) {
      return;
    }

    hasStartedAppWarmup = true;
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    // Warm the composer-critical data immediately so the first thread/new-thread
    // render doesn't become the first place these queries start.
    void utils.chatPreferences.get.prefetch();
    void utils.engines.list.prefetch();
    void utils.engines.models.prefetch({ engine: "sentinel" });
    void utils.engines.models.prefetch({ engine: "codex" });
    void utils.engines.models.prefetch({ engine: "claude" });
    void utils.engines.models.prefetch({ engine: "copilot" });
    void utils.workspaces.getCurrent.prefetch();
    void preflightMicrophonePermissionOnStartup().catch(() => {});

    const tasks: Array<() => void> = [
      () => {
        void fetch("/api/startup/warm", {
          credentials: "same-origin",
          keepalive: true,
          method: "POST",
        }).catch(() => {});
      },
      ...STATIC_APP_WARMUP_ROUTES.filter(isStaticAppWarmupRoute).map(
        (route) => () => {
          void router.prefetch(route);
        },
      ),
      () => {
        void utils.automations.list.prefetch();
      },
      () => {
        void utils.skills.list.prefetch();
        void utils.skills.registry.prefetch();
        void utils.engines.list.prefetch();
      },
      () => {
        void utils.appearance.get.prefetch();
        void utils.generalSettings.get.prefetch();
        void utils.voiceSettings.get.prefetch();
      },
      () => {
        void utils.backup.list.prefetch();
      },
      () => {
        void utils.integrations.list.prefetch();
      },
      () => {
        void utils.mcpServers.list.prefetch();
      },
      () => {
        void utils.memorySettings.get.prefetch();
        void utils.providers.list.prefetch();
        void utils.workspaces.list.prefetch();
        void utils.memory.list.prefetch(undefined);
      },
      () => {
        void utils.models.list.prefetch();
        void utils.engines.list.prefetch();
      },
      () => {
        void utils.personalization.get.prefetch();
      },
      () => {
        void utils.providers.list.prefetch();
      },
      () => {
        void utils.searchSettings.get.prefetch();
        void utils.searchProviders.list.prefetch();
      },
      () => {
        void utils.auth.me.prefetch();
        void utils.security.get.prefetch();
        void utils.workspaces.getCurrent.prefetch();
      },
      () => {
        void utils.approvals.get.prefetch();
      },
    ];

    const runBatch = (index: number) => {
      if (cancelled || index >= tasks.length) {
        return;
      }

      const cleanup = scheduleIdleTask(() => {
        if (cancelled) {
          return;
        }

        for (const task of tasks.slice(index, index + 2)) {
          task();
        }

        runBatch(index + 2);
      });

      cleanups.push(cleanup);
    };

    runBatch(0);

    return () => {
      cancelled = true;
      while (cleanups.length > 0) {
        cleanups.pop()?.();
      }
    };
  }, [router, utils]);

  return null;
}

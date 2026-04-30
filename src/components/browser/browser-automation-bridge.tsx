"use client";

import { useEffect, useRef } from "react";

import type {
  BrowserAutomationCommandEnvelope,
  BrowserAutomationCommandResult,
  BrowserAutomationResultEnvelope,
} from "@/lib/browser/automation-types";
import { getDesktopApi } from "@/lib/desktop/client";
import { useRightSidebar } from "@/components/shell/shell-context";

import { BrowserSidebar } from "./browser-sidebar";
import {
  getBrowserSidebarSnapshot,
  setActiveBrowserTab,
  setBrowserAutomationActiveTab,
} from "./browser-sidebar-store";
import { executeBrowserAutomationCommand } from "./browser-automation";

async function postResult(result: BrowserAutomationResultEnvelope) {
  await fetch("/api/browser-automation/result", {
    body: JSON.stringify(result),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function BrowserAutomationBridgeInner() {
  const rightSidebar = useRightSidebar();
  const rightSidebarRef = useRef(rightSidebar);

  useEffect(() => {
    rightSidebarRef.current = rightSidebar;
  }, [rightSidebar]);

  useEffect(() => {
    const abortController = new AbortController();
    let clearAutomationTimer: number | undefined;
    let stopped = false;
    const automationGlowLingerMs = 1_800;

    const cancelAutomationClear = () => {
      if (clearAutomationTimer === undefined) {
        return;
      }

      window.clearTimeout(clearAutomationTimer);
      clearAutomationTimer = undefined;
    };

    const markAutomationTab = (tabId: string | null | undefined) => {
      cancelAutomationClear();
      if (!tabId) {
        setBrowserAutomationActiveTab(null);
        return;
      }

      setBrowserAutomationActiveTab(tabId);
    };

    const scheduleAutomationClear = (tabId: string | null | undefined) => {
      cancelAutomationClear();
      if (!tabId) {
        setBrowserAutomationActiveTab(null);
        return;
      }

      clearAutomationTimer = window.setTimeout(() => {
        setBrowserAutomationActiveTab(null);
        clearAutomationTimer = undefined;
      }, automationGlowLingerMs);
    };

    const getCommandTargetTabId = (
      command: BrowserAutomationCommandEnvelope,
    ) => {
      const input = command.command;
      if ("tabId" in input && typeof input.tabId === "string") {
        return input.tabId;
      }
      if (input.type === "open" || input.type === "tabs") {
        return null;
      }
      return getBrowserSidebarSnapshot().activeTabId;
    };

    const getResultTabId = (result: BrowserAutomationCommandResult) => {
      if ("tab" in result && result.tab?.id) {
        return result.tab.id;
      }
      if ("activeTabId" in result && result.activeTabId) {
        return result.activeTabId;
      }
      return null;
    };

    const openBrowserPanel = (tabId?: string | null) => {
      if (tabId) {
        setActiveBrowserTab(tabId);
      }

      rightSidebarRef.current.open(<BrowserSidebar />, {
        panelId: "browser",
        size: "browser",
      });
    };

    const focusBrowserPanel = (command: BrowserAutomationCommandEnvelope) => {
      const currentState = getBrowserSidebarSnapshot();
      const targetTabId = getCommandTargetTabId(command);

      if (targetTabId) {
        setActiveBrowserTab(targetTabId);
        markAutomationTab(targetTabId);
      }

      if (command.command.type === "tabs" && currentState.tabs.length === 0) {
        return;
      }

      openBrowserPanel(targetTabId ?? currentState.activeTabId);
      return targetTabId ?? currentState.activeTabId;
    };

    const run = async () => {
      while (!stopped && !abortController.signal.aborted) {
        try {
          const response = await fetch("/api/browser-automation/poll", {
            cache: "no-store",
            signal: abortController.signal,
          });
          if (!response.ok) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
            continue;
          }

          const payload = (await response.json()) as {
            command?: BrowserAutomationCommandEnvelope | null;
          };
          const command = payload.command;
          if (!command) {
            continue;
          }

          let commandTabId: string | null = null;
          try {
            commandTabId = focusBrowserPanel(command) ?? null;
            const result = await executeBrowserAutomationCommand(command);
            const resultTabId = getResultTabId(result);
            commandTabId = resultTabId ?? commandTabId;
            markAutomationTab(commandTabId);
            openBrowserPanel(resultTabId);
            await postResult({
              commandId: command.id,
              ok: true,
              result,
            });
          } catch (error) {
            await postResult({
              commandId: command.id,
              error:
                error instanceof Error
                  ? error.message
                  : "Browser command failed.",
              ok: false,
            });
          } finally {
            scheduleAutomationClear(commandTabId);
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
    };

    void fetch("/api/browser-automation/status", { method: "POST" }).catch(
      () => {},
    );
    void run();

    return () => {
      stopped = true;
      cancelAutomationClear();
      setBrowserAutomationActiveTab(null);
      abortController.abort();
    };
  }, []);

  return null;
}

export function BrowserAutomationBridge() {
  if (!getDesktopApi()) {
    return null;
  }

  return <BrowserAutomationBridgeInner />;
}

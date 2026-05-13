"use client";

import { useCallback, useEffect, useRef } from "react";

import type {
  BrowserAutomationCommandEnvelope,
  BrowserAutomationCommandResult,
  BrowserAutomationResultEnvelope,
} from "@/lib/browser/automation-types";
import { useRightSidebar, useShell } from "@/components/shell/shell-context";
import { getDesktopApi } from "@/lib/desktop/client";

import { BrowserSidebar, BrowserViewport } from "./browser-sidebar";
import {
  getBrowserSidebarSnapshot,
  setBrowserAutomationActiveTab,
  setVisibleBrowserScopeId,
  useBrowserSidebarScopesSnapshot,
  useVisibleBrowserScopeId,
} from "./browser-sidebar-store";
import { executeBrowserAutomationCommand } from "./browser-automation";

async function postResult(result: BrowserAutomationResultEnvelope) {
  await fetch("/api/browser-automation/result", {
    body: JSON.stringify(result),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function BrowserAutomationHost() {
  const scopedSnapshots = useBrowserSidebarScopesSnapshot();
  const visibleScopeId = useVisibleBrowserScopeId();
  const registerWebview = useCallback(() => {}, []);

  const scopesWithTabs = scopedSnapshots.filter(
    ({ scopeId, state }) => scopeId !== visibleScopeId && state.tabs.length > 0,
  );

  if (scopesWithTabs.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-[-10000px] h-[800px] w-[1280px] overflow-hidden"
    >
      {scopesWithTabs.map(({ scopeId, state }) => {
        const deviceWidth = state.deviceToolbarEnabled
          ? state.deviceWidth
          : null;

        return (
          <div className="absolute inset-0" key={scopeId}>
            {state.tabs.map((tab) => (
              <BrowserViewport
                deviceWidth={deviceWidth}
                isAutomationActive={tab.id === state.automationActiveTabId}
                isActive
                key={tab.id}
                onRegisterWebview={registerWebview}
                scopeId={scopeId}
                tab={tab}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BrowserAutomationBridgeInner() {
  const { selectedThreadId } = useShell();
  const rightSidebar = useRightSidebar();
  const selectedThreadIdRef = useRef(selectedThreadId);
  const rightSidebarRef = useRef(rightSidebar);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

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

    const markAutomationTab = (
      scopeId: string,
      tabId: string | null | undefined,
    ) => {
      cancelAutomationClear();
      if (!tabId) {
        setBrowserAutomationActiveTab(null, scopeId);
        return;
      }

      setBrowserAutomationActiveTab(tabId, scopeId);
    };

    const scheduleAutomationClear = (
      scopeId: string,
      tabId: string | null | undefined,
    ) => {
      cancelAutomationClear();
      if (!tabId) {
        setBrowserAutomationActiveTab(null, scopeId);
        return;
      }

      clearAutomationTimer = window.setTimeout(() => {
        setBrowserAutomationActiveTab(null, scopeId);
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
      return getBrowserSidebarSnapshot(command.threadId).activeTabId;
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

    const markCommandTarget = (command: BrowserAutomationCommandEnvelope) => {
      const currentState = getBrowserSidebarSnapshot(command.threadId);
      const targetTabId = getCommandTargetTabId(command);

      if (targetTabId) {
        markAutomationTab(command.threadId, targetTabId);
      }

      if (command.command.type === "tabs" && currentState.tabs.length === 0) {
        return;
      }

      return targetTabId ?? currentState.activeTabId;
    };

    const openVisibleBrowserIfCurrentThread = (
      command: BrowserAutomationCommandEnvelope,
    ) => {
      if (command.threadId !== selectedThreadIdRef.current) {
        return;
      }

      setVisibleBrowserScopeId(command.threadId);
      rightSidebarRef.current.open(
        <BrowserSidebar scopeId={command.threadId} />,
        {
          panelId: "browser",
          size: "browser",
        },
      );
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
            openVisibleBrowserIfCurrentThread(command);
            commandTabId = markCommandTarget(command) ?? null;
            const result = await executeBrowserAutomationCommand(command);
            const resultTabId = getResultTabId(result);
            commandTabId = resultTabId ?? commandTabId;
            markAutomationTab(command.threadId, commandTabId);
            await postResult({
              commandId: command.id,
              ok: true,
              result,
              threadId: command.threadId,
            });
          } catch (error) {
            await postResult({
              commandId: command.id,
              error:
                error instanceof Error
                  ? error.message
                  : "Browser command failed.",
              ok: false,
              threadId: command.threadId,
            });
          } finally {
            scheduleAutomationClear(command.threadId, commandTabId);
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
      abortController.abort();
    };
  }, []);

  return <BrowserAutomationHost />;
}

export function BrowserAutomationBridge() {
  if (!getDesktopApi()) {
    return null;
  }

  return <BrowserAutomationBridgeInner />;
}

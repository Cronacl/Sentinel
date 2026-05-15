"use client";

import { useEffect } from "react";

import type {
  ComputerAutomationCommandEnvelope,
  ComputerAutomationCommandResult,
  ComputerAutomationResultEnvelope,
} from "@/lib/computer/automation-types";
import { getDesktopApi } from "@/lib/desktop/client";

async function postResult(result: ComputerAutomationResultEnvelope) {
  await fetch("/api/computer-automation/result", {
    body: JSON.stringify(result),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function executeComputerCommand(
  command: ComputerAutomationCommandEnvelope,
): Promise<ComputerAutomationCommandResult> {
  const desktop = getDesktopApi();
  if (!desktop?.computer) {
    throw new Error(
      "Desktop computer-use APIs are unavailable. Open Sentinel in the desktop app.",
    );
  }

  switch (command.command.type) {
    case "status":
      return await desktop.computer.status();
    case "screenshot":
      return await desktop.computer.screenshot({
        appName: command.command.appName,
        bundleId: command.command.bundleId,
        displayId: command.command.displayId,
      });
    case "action":
      return await desktop.computer.action({
        actions: command.command.actions,
        appName: command.command.appName,
        bundleId: command.command.bundleId,
      });
    case "apps":
      return await desktop.computer.apps();
    case "app":
      return await desktop.computer.app({
        appName: command.command.appName,
        bundleId: command.command.bundleId,
        mode: command.command.mode,
      });
    case "clipboard":
      return await desktop.computer.clipboard(command.command.text);
    case "ax_tree":
      return await desktop.computer.axTree({
        appName: command.command.appName,
        bundleId: command.command.bundleId,
        maxDepth: command.command.maxDepth,
        maxNodes: command.command.maxNodes,
      });
    case "ax_find":
      return await desktop.computer.axFind({
        appName: command.command.appName,
        bundleId: command.command.bundleId,
        maxDepth: command.command.maxDepth,
        maxMatches: command.command.maxMatches,
        maxNodes: command.command.maxNodes,
        query: command.command.query,
      });
    case "ax_action":
      return await desktop.computer.axAction({
        action: command.command.action,
        appName: command.command.appName,
        axPath: command.command.axPath,
        bundleId: command.command.bundleId,
        query: command.command.query,
        value: command.command.value,
      });
  }
}

export function ComputerAutomationBridge() {
  useEffect(() => {
    if (!getDesktopApi()) return;

    const abortController = new AbortController();
    let stopped = false;

    const run = async () => {
      while (!stopped && !abortController.signal.aborted) {
        try {
          const response = await fetch("/api/computer-automation/poll", {
            cache: "no-store",
            signal: abortController.signal,
          });
          if (!response.ok) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
            continue;
          }

          const payload = (await response.json()) as {
            command?: ComputerAutomationCommandEnvelope | null;
          };
          const command = payload.command;
          if (!command) continue;

          try {
            const result = await executeComputerCommand(command);
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
                  : "Computer command failed.",
              ok: false,
              threadId: command.threadId,
            });
          }
        } catch {
          if (abortController.signal.aborted) return;
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
    };

    void fetch("/api/computer-automation/status", { method: "POST" }).catch(
      () => {},
    );
    void run();

    return () => {
      stopped = true;
      abortController.abort();
    };
  }, []);

  return null;
}

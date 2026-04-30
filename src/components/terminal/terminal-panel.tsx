"use client";

import {
  Add01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, CloseButton, ScrollShadow } from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";

import { TerminalInstance } from "./terminal-instance";
import {
  closeTerminal,
  createTerminalSession,
  getTerminalDefaultCwd,
  killTerminalSession,
  refreshTerminalShellTasks,
  setActiveTerminalSession,
  setTerminalPanelHeight,
  stopTerminalShellTask,
  type TerminalShellTask,
  useTerminalState,
} from "./terminal-store";

const RESIZE_HANDLE_HEIGHT = 12;
const TAB_MOTION_TRANSITION = {
  opacity: {
    duration: 0.16,
    ease: [0.32, 0.72, 0, 1] as const,
  },
  scale: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  width: {
    duration: 0.24,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  x: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  layout: {
    duration: 0.24,
    ease: [0.16, 1, 0.3, 1] as const,
  },
};

function formatTaskDuration(durationMs: number) {
  if (durationMs < 60_000) {
    return `${Math.max(1, Math.round(durationMs / 1000))}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getTaskLabel(task: TerminalShellTask) {
  const firstLine = task.command.split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) {
    return task.backgroundTaskId;
  }

  return firstLine.length > 56 ? `${firstLine.slice(0, 56)}...` : firstLine;
}

export function TerminalPanel() {
  const { activeSessionId, isOpen, panelHeight, sessions, shellTasks } =
    useTerminalState((state) => ({
      activeSessionId: state.activeSessionId,
      isOpen: state.isOpen,
      panelHeight: state.panelHeight,
      sessions: state.sessions,
      shellTasks: state.shellTasks,
    }));
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ??
      sessions[0] ??
      null,
    [activeSessionId, sessions],
  );

  const defaultCwd = getTerminalDefaultCwd();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        await refreshTerminalShellTasks();
      } catch {
        // The terminal panel should keep working even if the task API is not ready.
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (!cancelled) {
        void refresh();
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isOpen]);

  const handleCreateSession = useCallback(async () => {
    setIsCreatingSession(true);

    try {
      await createTerminalSession(defaultCwd);
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, "Unable to start a terminal."),
        title: "Terminal failed",
      });
    } finally {
      setIsCreatingSession(false);
    }
  }, [defaultCwd]);

  const handleCloseSession = useCallback(async (sessionId: string) => {
    setClosingSessionId(sessionId);

    try {
      await killTerminalSession(sessionId);
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, "Unable to close the terminal."),
        title: "Terminal failed",
      });
    } finally {
      setClosingSessionId((current) =>
        current === sessionId ? null : current,
      );
    }
  }, []);

  const handleStopShellTask = useCallback(async (backgroundTaskId: string) => {
    setStoppingTaskId(backgroundTaskId);

    try {
      await stopTerminalShellTask(backgroundTaskId);
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, "Unable to stop this shell task."),
        title: "Shell task failed",
      });
    } finally {
      setStoppingTaskId((current) =>
        current === backgroundTaskId ? null : current,
      );
    }
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startY = event.clientY;
      const startHeight = panelHeight;
      setIsResizing(true);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = startY - moveEvent.clientY;
        setTerminalPanelHeight(startHeight + deltaY);
      };

      const handlePointerUp = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [panelHeight],
  );

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.section
          animate={{ height: panelHeight, opacity: 1 }}
          className="pointer-events-auto relative z-20 shrink-0 overflow-hidden border-t border-separator/40 bg-background"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={
            isResizing ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
          }
        >
          <div className="relative flex h-full min-h-0 flex-col">
            {/* Resize handle */}
            <div
              className="absolute inset-x-0 top-0 z-10 flex h-3 cursor-row-resize items-center justify-center"
              onPointerDown={handleResizeStart}
              style={{
                transform: `translateY(-${RESIZE_HANDLE_HEIGHT / 2}px)`,
              }}
            >
              <div className="h-0.5 w-10 rounded-full bg-foreground/8 transition-colors hover:bg-foreground/16" />
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1.5 border-b border-separator/30 px-2 py-1.5">
              <ScrollShadow
                className="min-w-0 flex-1"
                hideScrollBar
                orientation="horizontal"
              >
                <motion.div
                  className="flex min-w-max items-center gap-1 pr-2"
                  layout
                  transition={TAB_MOTION_TRANSITION}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {sessions.map((session) => {
                      const isActive = session.id === activeSession?.id;

                      return (
                        <motion.div
                          key={session.id}
                          animate={{
                            opacity: 1,
                            scale: 1,
                            width: "auto",
                            x: 0,
                          }}
                          className="shrink-0 overflow-hidden"
                          exit={{ opacity: 0, scale: 0.94, width: 0, x: -10 }}
                          initial={{ opacity: 0, scale: 0.94, width: 0, x: 10 }}
                          layout="position"
                          style={{ originX: 0.5 }}
                          transition={TAB_MOTION_TRANSITION}
                        >
                          <div
                            className={`group relative flex min-h-[24px] min-w-0 max-w-36 items-center rounded-full p-[1px] transition-[background-color,color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              isActive
                                ? "border border-border bg-foreground/[0.04] text-foreground dark:bg-foreground/[0.06]"
                                : "border border-transparent text-muted hover:bg-foreground/[0.02] hover:text-foreground dark:hover:bg-foreground/[0.03]"
                            }`}
                          >
                            <button
                              className="flex h-[20px] min-w-0 flex-1 items-center justify-start gap-1 rounded-full px-[4px] py-0 text-left transition-[color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                              onClick={() =>
                                setActiveTerminalSession(session.id)
                              }
                              type="button"
                            >
                              <HugeiconsIcon
                                color="currentColor"
                                icon={ComputerTerminal01Icon}
                                size={11}
                                strokeWidth={1.9}
                              />
                              <span className="truncate text-[10px] font-medium leading-[1.15]">
                                {session.label}
                              </span>
                              {session.exited ? (
                                <span className="shrink-0 text-[9px] tracking-[0.08em] text-danger/70">
                                  exited
                                </span>
                              ) : null}
                            </button>

                            <button
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-foreground/[0.05] hover:text-foreground active:scale-95 ${
                                isActive
                                  ? "text-foreground/70 opacity-100"
                                  : "text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                              }`}
                              disabled={closingSessionId === session.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCloseSession(session.id);
                              }}
                              type="button"
                            >
                              <HugeiconsIcon
                                color="currentColor"
                                icon={Cancel01Icon}
                                size={10}
                                strokeWidth={2}
                              />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              </ScrollShadow>

              {shellTasks.length > 0 ? (
                <ScrollShadow
                  className="max-w-[42%] min-w-0 shrink border-l border-separator/30 pl-1.5"
                  hideScrollBar
                  orientation="horizontal"
                >
                  <div className="flex min-w-max items-center gap-1 pr-1">
                    {shellTasks.map((task) => (
                      <div
                        className="group flex h-6 max-w-64 items-center gap-1 rounded-full border border-border/70 bg-foreground/[0.035] px-1.5 text-[10px] text-foreground/75 dark:bg-foreground/[0.05]"
                        key={task.backgroundTaskId}
                        title={`${task.command}\n${task.cwd}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                        <HugeiconsIcon
                          color="currentColor"
                          icon={ComputerTerminal01Icon}
                          size={11}
                          strokeWidth={1.9}
                        />
                        <span className="truncate font-mono leading-none">
                          {getTaskLabel(task)}
                        </span>
                        <span className="shrink-0 text-muted">
                          {formatTaskDuration(task.durationMs)}
                        </span>
                        <button
                          aria-label="Stop shell task"
                          className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-muted opacity-70 transition-[opacity,background-color,color,transform] hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100 active:scale-95"
                          disabled={stoppingTaskId === task.backgroundTaskId}
                          onClick={() => {
                            void handleStopShellTask(task.backgroundTaskId);
                          }}
                          type="button"
                        >
                          <HugeiconsIcon
                            color="currentColor"
                            icon={Cancel01Icon}
                            size={9}
                            strokeWidth={2}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollShadow>
              ) : null}

              <Button
                className="size-6 shrink-0"
                isDisabled={!defaultCwd}
                isPending={isCreatingSession}
                onPress={() => {
                  void handleCreateSession();
                }}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Add01Icon}
                  size={13}
                  strokeWidth={2}
                />
              </Button>

              <CloseButton
                aria-label="Close terminal panel"
                className="size-6"
                onPress={closeTerminal}
              />
            </div>

            {/* Terminal content */}
            <div className="relative min-h-0 flex-1">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`absolute inset-0 ${
                      session.id === activeSession?.id ? "block" : "hidden"
                    }`}
                  >
                    <TerminalInstance
                      isActive={session.id === activeSession?.id}
                      sessionId={session.id}
                    />
                  </div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-muted">
                      No active sessions.{" "}
                      <button
                        className="text-foreground underline underline-offset-2 hover:no-underline"
                        disabled={!defaultCwd}
                        onClick={() => {
                          void handleCreateSession();
                        }}
                        type="button"
                      >
                        Open a terminal
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

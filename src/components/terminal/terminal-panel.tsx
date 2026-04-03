"use client";

import {
  Add01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, CloseButton } from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
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
  setActiveTerminalSession,
  setTerminalPanelHeight,
  useTerminalState,
} from "./terminal-store";

const RESIZE_HANDLE_HEIGHT = 12;

export function TerminalPanel() {
  const { activeSessionId, isOpen, panelHeight, sessions } = useTerminalState(
    (state) => ({
      activeSessionId: state.activeSessionId,
      isOpen: state.isOpen,
      panelHeight: state.panelHeight,
      sessions: state.sessions,
    }),
  );
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ??
      sessions[0] ??
      null,
    [activeSessionId, sessions],
  );

  const defaultCwd = getTerminalDefaultCwd();

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
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                {sessions.map((session) => {
                  const isActive = session.id === activeSession?.id;

                  return (
                    <div
                      key={session.id}
                      className={`group flex min-w-0 items-center gap-0.5 rounded-md px-2 py-1 transition-colors ${
                        isActive
                          ? "bg-foreground/[0.06] text-foreground"
                          : "text-muted hover:bg-foreground/[0.03] hover:text-foreground"
                      }`}
                    >
                      <button
                        className="flex min-w-0 items-center gap-1.5 text-left"
                        onClick={() => setActiveTerminalSession(session.id)}
                        type="button"
                      >
                        <HugeiconsIcon
                          color="currentColor"
                          icon={ComputerTerminal01Icon}
                          size={13}
                          strokeWidth={1.8}
                        />
                        <span className="truncate text-xs font-medium">
                          {session.label}
                        </span>
                        {session.exited ? (
                          <span className="text-[10px] text-danger/70">
                            exited
                          </span>
                        ) : null}
                      </button>

                      <button
                        className="ml-0.5 rounded p-0.5 text-muted opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
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
                          size={11}
                          strokeWidth={2}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              <Button
                className="shrink-0 h-6 min-w-6 gap-1 px-1.5"
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

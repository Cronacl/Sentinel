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

const RESIZE_HANDLE_HEIGHT = 16;

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
      const startY = event.clientY;
      const startHeight = panelHeight;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = startY - moveEvent.clientY;
        setTerminalPanelHeight(startHeight + deltaY);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [panelHeight],
  );

  return (
    <AnimatePresence initial={false} mode="wait">
      {isOpen ? (
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden border-t border-separator/50 bg-background/96 shadow-[0_-24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:bg-surface/92"
          exit={{ y: 24 }}
          initial={{ y: 24 }}
          style={{ height: panelHeight }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div
            className="absolute inset-x-0 top-0 z-10 flex h-4 cursor-row-resize items-center justify-center"
            onPointerDown={handleResizeStart}
            style={{ transform: `translateY(-${RESIZE_HANDLE_HEIGHT / 2}px)` }}
          >
            <div className="h-1 w-16 rounded-full bg-foreground/12 transition-colors hover:bg-foreground/22" />
          </div>

          <div className="flex items-center gap-2 border-b border-separator/50 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {sessions.map((session) => {
                const isActive = session.id === activeSession?.id;

                return (
                  <div
                    key={session.id}
                    className={`group flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 transition-colors ${
                      isActive
                        ? "border-separator/50 bg-background text-foreground"
                        : "border-transparent bg-transparent text-muted hover:border-separator/50 hover:bg-foreground/[0.03] hover:text-foreground"
                    }`}
                  >
                    <button
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() => setActiveTerminalSession(session.id)}
                      type="button"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={ComputerTerminal01Icon}
                        size={14}
                        strokeWidth={1.7}
                      />
                      <span className="truncate text-xs font-medium">
                        {session.label}
                      </span>
                      {session.exited ? (
                        <span className="rounded-full border border-danger/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-danger">
                          exit {session.exitCode ?? 0}
                        </span>
                      ) : null}
                    </button>

                    <button
                      className="rounded-full p-1 text-muted transition-colors hover:bg-surface/50 hover:text-foreground"
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
                        size={12}
                        strokeWidth={1.8}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <Button
              className="shrink-0 h-7"
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
                size={14}
                strokeWidth={1.7}
              />
              <span>New terminal</span>
            </Button>

            <CloseButton
              aria-label="Close terminal panel"
              onPress={closeTerminal}
            />
          </div>

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
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-sm rounded-2xl border border-dashed border-border/60 bg-foreground/[0.03] px-6 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No terminal session
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Start a shell for this workspace from the repo header or
                    open a new terminal here.
                  </p>
                  <Button
                    className="mt-4"
                    isDisabled={!defaultCwd}
                    onPress={() => {
                      void handleCreateSession();
                    }}
                    size="sm"
                    variant="tertiary"
                  >
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Add01Icon}
                      size={14}
                      strokeWidth={1.7}
                    />
                    <span>New terminal</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

"use client";

import { Spinner } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { createCommandSessionPool } from "@/components/terminal/command-session-pool";
import { TerminalInstance } from "@/components/terminal/terminal-instance";
import {
  createCommandTerminalSession,
  disposeCommandTerminalSession,
  subscribeTerminalExit,
  type TerminalExit,
} from "@/components/terminal/terminal-store";
import type { EngineAuthTerminalInteraction } from "@/lib/ai/chat/engines/contract";
import { getErrorMessage } from "@/lib/errors";

import { toDesktopTerminalCommand } from "./engine-auth-helpers";

// The embedded terminal of a sign-in: Electron main runs the command the
// server vended for the flow's launch ticket (see terminal-commands.mjs),
// and this view shows it with the app's terminal renderer. A session lives
// as long as some view shows its ticket.

const commandSessions = createCommandSessionPool<string>({
  dispose: (sessionId) => disposeCommandTerminalSession(sessionId),
});

/** Shell convention: a command killed by signal N exits with 128 + N. */
function toExitCode(exit: TerminalExit) {
  return exit.signal ? 128 + exit.signal : exit.exitCode;
}

export function EngineAuthTerminal({
  interaction,
  onError,
  onExit,
}: {
  interaction: EngineAuthTerminalInteraction;
  /** The terminal could not start; the panel falls back to copying. */
  onError: (message: string) => void;
  onExit: (exitCode: number) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const callbacks = useRef({ onError, onExit });
  const ticket = interaction.launch?.ticket ?? null;

  useEffect(() => {
    callbacks.current = { onError, onExit };
  });

  useEffect(() => {
    const request = toDesktopTerminalCommand(interaction);
    if (!ticket || !request) {
      return;
    }

    let mounted = true;
    let unsubscribe = () => {};
    commandSessions
      .acquire(ticket, async () => {
        const session = await createCommandTerminalSession(request);
        return session.sessionId;
      })
      .then((id) => {
        if (!mounted) {
          return;
        }
        setSessionId(id);
        unsubscribe = subscribeTerminalExit(id, (exit) => {
          if (mounted) {
            callbacks.current.onExit(toExitCode(exit));
          }
        });
      })
      .catch((error: unknown) => {
        if (mounted) {
          callbacks.current.onError(
            getErrorMessage(error, "The sign-in terminal could not start."),
          );
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
      commandSessions.release(ticket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one session per ticket; the interaction changes with it
  }, [ticket]);

  return (
    <div className="border-separator/30 bg-background mt-2 h-56 overflow-hidden rounded-lg border p-1.5">
      {sessionId ? (
        <TerminalInstance embedded isActive sessionId={sessionId} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}

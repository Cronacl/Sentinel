"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

import { subscribeTerminalOutput } from "./terminal-store";

type TerminalInstanceProps = {
  isActive: boolean;
  sessionId: string;
};

function getTerminalTheme(theme: "light" | "dark") {
  if (theme === "light") {
    return {
      background: "#fcfcfc",
      black: "#1f2937",
      blue: "#2563eb",
      brightBlack: "#6b7280",
      brightBlue: "#1d4ed8",
      brightCyan: "#0f766e",
      brightGreen: "#15803d",
      brightMagenta: "#a21caf",
      brightRed: "#dc2626",
      brightWhite: "#111827",
      brightYellow: "#b45309",
      cursor: "#111827",
      cyan: "#0f766e",
      foreground: "#171717",
      green: "#15803d",
      magenta: "#a21caf",
      red: "#dc2626",
      selectionBackground: "rgba(15, 23, 42, 0.16)",
      white: "#374151",
      yellow: "#b45309",
    };
  }

  return {
    background: "#050505",
    black: "#1f2937",
    blue: "#60a5fa",
    brightBlack: "#6b7280",
    brightBlue: "#93c5fd",
    brightCyan: "#67e8f9",
    brightGreen: "#86efac",
    brightMagenta: "#f0abfc",
    brightRed: "#fca5a5",
    brightWhite: "#f9fafb",
    brightYellow: "#fde68a",
    cursor: "#fafafa",
    cyan: "#22d3ee",
    foreground: "#f5f5f5",
    green: "#4ade80",
    magenta: "#e879f9",
    red: "#f87171",
    selectionBackground: "rgba(255, 255, 255, 0.16)",
    white: "#e5e7eb",
    yellow: "#facc15",
  };
}

export function TerminalInstance({
  isActive,
  sessionId,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const theme = useResolvedTheme();

  useEffect(() => {
    const desktop = getDesktopApi();
    const container = containerRef.current;
    if (!desktop || !container) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        '"SF Mono", "Fira Code", "Menlo", "Monaco", "Consolas", monospace',
      fontSize: 12.5,
      lineHeight: 1.3,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: getTerminalTheme(theme),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const outputSubscription = subscribeTerminalOutput(sessionId, (data) => {
      terminal.write(data);
    });

    if (outputSubscription.initialOutput) {
      terminal.write(outputSubscription.initialOutput);
    }

    const fitAndResize = () => {
      if (!container.isConnected || container.offsetParent === null) {
        return;
      }

      fitAddon.fit();
      const dimensions = fitAddon.proposeDimensions();
      if (!dimensions) {
        return;
      }

      desktop.terminal.resize(sessionId, dimensions.cols, dimensions.rows);
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitAndResize);
    });

    resizeObserver.observe(container);

    terminal.onData((data) => {
      desktop.terminal.write(sessionId, data);
    });

    requestAnimationFrame(fitAndResize);

    return () => {
      outputSubscription.unsubscribe();
      resizeObserver.disconnect();
      fitAddon.dispose();
      terminal.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = getTerminalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();

      const desktop = getDesktopApi();
      const dimensions = fitAddonRef.current?.proposeDimensions();
      if (!desktop || !dimensions) {
        return;
      }

      desktop.terminal.resize(sessionId, dimensions.cols, dimensions.rows);
      terminalRef.current?.focus();
    });
  }, [isActive, sessionId]);

  return (
    <div
      className={`sentinel-terminal relative h-full min-h-0 w-full ${
        isActive ? "block" : "hidden"
      }`}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

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
      background: "#fafafa",
      foreground: "#1a1a1a",
      cursor: "#1a1a1a",
      cursorAccent: "#fafafa",
      selectionBackground: "rgba(0, 0, 0, 0.12)",
      selectionForeground: "#1a1a1a",
      black: "#1e1e1e",
      red: "#d93025",
      green: "#188038",
      yellow: "#b06000",
      blue: "#1a73e8",
      magenta: "#9334e6",
      cyan: "#007b83",
      white: "#5f6368",
      brightBlack: "#80868b",
      brightRed: "#c5221f",
      brightGreen: "#137333",
      brightYellow: "#9a5b00",
      brightBlue: "#1967d2",
      brightMagenta: "#7627bb",
      brightCyan: "#055f5f",
      brightWhite: "#202124",
    };
  }

  return {
    background: "#0a0a0a",
    foreground: "#e5e5e5",
    cursor: "#e5e5e5",
    cursorAccent: "#0a0a0a",
    selectionBackground: "rgba(255, 255, 255, 0.12)",
    selectionForeground: "#e5e5e5",
    black: "#1a1a1a",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#d4d4d4",
    brightBlack: "#737373",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#fafafa",
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
      cursorStyle: "bar",
      cursorWidth: 1,
      fontFamily:
        '"SF Mono", "Fira Code", "Menlo", "Monaco", "Consolas", monospace',
      fontSize: 12.5,
      letterSpacing: 0,
      lineHeight: 1.35,
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

"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE,
  readStoredAppearanceSettings,
} from "@/lib/appearance";
import { getDesktopApi } from "@/lib/desktop/client";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

import { closeTerminal } from "./terminal-store";
import { subscribeTerminalOutput } from "./terminal-store";
import { isTerminalToggleShortcut } from "./terminal-shortcuts";

type TerminalInstanceProps = {
  isActive: boolean;
  sessionId: string;
};

function getTerminalTheme(theme: "light" | "dark") {
  if (typeof document !== "undefined") {
    const rootStyle = getComputedStyle(document.documentElement);

    return {
      background:
        rootStyle.getPropertyValue("--background").trim() ||
        (theme === "light" ? "#fff" : "#000"),
      foreground:
        rootStyle.getPropertyValue("--syntax-foreground").trim() ||
        (theme === "light" ? "#111111" : "#e5e5e5"),
      cursor:
        rootStyle.getPropertyValue("--syntax-foreground").trim() ||
        (theme === "light" ? "#111111" : "#e5e5e5"),
      cursorAccent:
        rootStyle.getPropertyValue("--background").trim() ||
        (theme === "light" ? "#ffffff" : "#111111"),
      selectionBackground:
        theme === "light"
          ? "rgba(17, 17, 17, 0.14)"
          : "rgba(229, 229, 229, 0.12)",
      selectionForeground:
        rootStyle.getPropertyValue("--syntax-foreground").trim() ||
        (theme === "light" ? "#111111" : "#e5e5e5"),
      black:
        rootStyle.getPropertyValue("--syntax-ansi-black").trim() ||
        (theme === "light" ? "#111827" : "#1a1a1a"),
      red:
        rootStyle.getPropertyValue("--syntax-ansi-red").trim() ||
        (theme === "light" ? "#cf222e" : "#ff7b72"),
      green:
        rootStyle.getPropertyValue("--syntax-ansi-green").trim() ||
        (theme === "light" ? "#116329" : "#7ee787"),
      yellow:
        rootStyle.getPropertyValue("--syntax-ansi-yellow").trim() ||
        (theme === "light" ? "#9a6700" : "#e3b341"),
      blue:
        rootStyle.getPropertyValue("--syntax-ansi-blue").trim() ||
        (theme === "light" ? "#0550ae" : "#79c0ff"),
      magenta:
        rootStyle.getPropertyValue("--syntax-ansi-magenta").trim() ||
        (theme === "light" ? "#8250df" : "#d2a8ff"),
      cyan:
        rootStyle.getPropertyValue("--syntax-ansi-cyan").trim() ||
        (theme === "light" ? "#0f766e" : "#39c5cf"),
      white:
        rootStyle.getPropertyValue("--syntax-ansi-white").trim() ||
        (theme === "light" ? "#6e7781" : "#8b949e"),
      brightBlack:
        rootStyle.getPropertyValue("--syntax-ansi-bright-black").trim() ||
        (theme === "light" ? "#6e7781" : "#8b949e"),
      brightRed:
        rootStyle.getPropertyValue("--syntax-ansi-bright-red").trim() ||
        (theme === "light" ? "#cf222e" : "#ff7b72"),
      brightGreen:
        rootStyle.getPropertyValue("--syntax-ansi-bright-green").trim() ||
        (theme === "light" ? "#116329" : "#7ee787"),
      brightYellow:
        rootStyle.getPropertyValue("--syntax-ansi-bright-yellow").trim() ||
        (theme === "light" ? "#9a6700" : "#e3b341"),
      brightBlue:
        rootStyle.getPropertyValue("--syntax-ansi-bright-blue").trim() ||
        (theme === "light" ? "#0550ae" : "#79c0ff"),
      brightMagenta:
        rootStyle.getPropertyValue("--syntax-ansi-bright-magenta").trim() ||
        (theme === "light" ? "#8250df" : "#d2a8ff"),
      brightCyan:
        rootStyle.getPropertyValue("--syntax-ansi-bright-cyan").trim() ||
        (theme === "light" ? "#0f766e" : "#39c5cf"),
      brightWhite:
        rootStyle.getPropertyValue("--syntax-ansi-bright-white").trim() ||
        (theme === "light" ? "#111111" : "#e5e5e5"),
    };
  }

  return {
    background: theme === "light" ? "#ffffff" : "#000",
    foreground: theme === "light" ? "#111111" : "#e5e5e5",
    cursor: theme === "light" ? "#111111" : "#e5e5e5",
    cursorAccent: theme === "light" ? "#ffffff" : "#111111",
    selectionBackground:
      theme === "light"
        ? "rgba(17, 17, 17, 0.14)"
        : "rgba(229, 229, 229, 0.12)",
    selectionForeground: theme === "light" ? "#111111" : "#e5e5e5",
    black: theme === "light" ? "#111827" : "#1a1a1a",
    red: theme === "light" ? "#cf222e" : "#ff7b72",
    green: theme === "light" ? "#116329" : "#7ee787",
    yellow: theme === "light" ? "#9a6700" : "#e3b341",
    blue: theme === "light" ? "#0550ae" : "#79c0ff",
    magenta: theme === "light" ? "#8250df" : "#d2a8ff",
    cyan: theme === "light" ? "#0f766e" : "#39c5cf",
    white: theme === "light" ? "#6e7781" : "#8b949e",
    brightBlack: theme === "light" ? "#6e7781" : "#8b949e",
    brightRed: theme === "light" ? "#cf222e" : "#ff7b72",
    brightGreen: theme === "light" ? "#116329" : "#7ee787",
    brightYellow: theme === "light" ? "#9a6700" : "#e3b341",
    brightBlue: theme === "light" ? "#0550ae" : "#79c0ff",
    brightMagenta: theme === "light" ? "#8250df" : "#d2a8ff",
    brightCyan: theme === "light" ? "#0f766e" : "#39c5cf",
    brightWhite: theme === "light" ? "#111111" : "#e5e5e5",
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

  const syncTerminalTypography = () => {
    const terminal = terminalRef.current;
    if (!terminal || typeof document === "undefined") {
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const fallback = readStoredAppearanceSettings();
    const fontFamily =
      rootStyle.getPropertyValue("--app-font-mono").trim() ||
      fallback.codeFontFamily ||
      DEFAULT_CODE_FONT_FAMILY;
    const fontSize =
      Number.parseFloat(rootStyle.getPropertyValue("--app-code-font-size")) ||
      fallback.codeFontSize ||
      DEFAULT_CODE_FONT_SIZE;

    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = fontSize;
    fitAddonRef.current?.fit();
  };

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
      fontFamily: readStoredAppearanceSettings().codeFontFamily,
      fontSize: readStoredAppearanceSettings().codeFontSize,
      letterSpacing: 0,
      lineHeight: 1.35,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: getTerminalTheme(theme),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminal.attachCustomKeyEventHandler((event) => {
      if (!isTerminalToggleShortcut(event, desktop.app.platform)) {
        return true;
      }

      event.preventDefault();
      closeTerminal();
      return false;
    });

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

    const handleAppearanceChange = () => {
      requestAnimationFrame(() => {
        syncTerminalTypography();
        fitAndResize();
      });
    };

    window.addEventListener(
      "sentinel-appearance-change",
      handleAppearanceChange,
    );

    return () => {
      outputSubscription.unsubscribe();
      resizeObserver.disconnect();
      window.removeEventListener(
        "sentinel-appearance-change",
        handleAppearanceChange,
      );
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
    syncTerminalTypography();
  }, []);

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

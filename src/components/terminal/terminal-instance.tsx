"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE,
  getActiveCodeThemeName,
  getTerminalThemePalette,
  readStoredAppearanceSettings,
} from "@/lib/appearance";
import { getDesktopApi } from "@/lib/desktop/client";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

import { subscribeTerminalOutput } from "./terminal-store";

type TerminalInstanceProps = {
  isActive: boolean;
  sessionId: string;
};

function getTerminalTheme(theme: "light" | "dark") {
  return getTerminalThemePalette(getActiveCodeThemeName(), theme);
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

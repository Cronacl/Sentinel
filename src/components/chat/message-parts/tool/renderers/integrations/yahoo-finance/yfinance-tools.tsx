"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import {
  YFinanceSearchSidebar,
  YFinanceQuoteSidebar,
  YFinanceChartSidebar,
} from "./yfinance-sidebar";

type SearchOutput = {
  results: Array<{
    symbol: string;
    shortname: string;
    longname: string | null;
    exchDisp: string;
    typeDisp: string;
  }>;
};

type QuoteOutput = {
  quotes: Array<{
    symbol: string;
    shortName: string;
    longName: string | null;
    currency: string;
    exchange: string;
    marketState: string;
    regularMarketPrice: number;
    regularMarketChange: number;
    regularMarketChangePercent: number;
    regularMarketVolume: number;
    regularMarketDayHigh: number;
    regularMarketDayLow: number;
    regularMarketOpen: number;
    regularMarketPreviousClose: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    marketCap: number | null;
  }>;
};

type ChartOutput = {
  symbol: string;
  dataPoints: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  totalPoints: number;
};

export const YFinanceSearchTool = memo(function YFinanceSearchTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as SearchOutput) : null;
  const input = "input" in part ? (part.input as { query?: string }) : null;

  const canOpen = Boolean(output && output.results.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.results.length === 0) return;
    open(
      <YFinanceSearchSidebar
        query={input?.query ?? ""}
        results={output.results}
      />,
    );
  }, [open, output, input?.query]);

  const label = (() => {
    if (isError) return "Yahoo Finance search failed";
    if (isRunning) {
      return input?.query
        ? `Searching Yahoo Finance for \u201c${input.query}\u201d`
        : "Searching Yahoo Finance\u2026";
    }
    if (output) {
      const count = output.results.length;
      return `Found ${count} result${count !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return "Searching Yahoo Finance\u2026";
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <IntegrationProviderIcon
        provider="yahoo_finance"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});

export const YFinanceQuoteTool = memo(function YFinanceQuoteTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as QuoteOutput) : null;
  const input = "input" in part ? (part.input as { symbols?: string[] }) : null;

  const canOpen = Boolean(output && output.quotes.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.quotes.length === 0) return;
    open(<YFinanceQuoteSidebar quotes={output.quotes} />);
  }, [open, output]);

  const label = (() => {
    if (isError) return "Failed to get stock quote";
    if (isRunning) {
      const syms = input?.symbols?.join(", ");
      return syms ? `Getting quote for ${syms}` : "Getting stock quote\u2026";
    }
    if (output && output.quotes.length > 0) {
      if (output.quotes.length === 1) {
        const q = output.quotes[0]!;
        const sign = q.regularMarketChange >= 0 ? "+" : "";
        return `${q.symbol} ${q.regularMarketPrice.toFixed(2)} ${sign}${q.regularMarketChangePercent.toFixed(2)}%`;
      }
      return `${output.quotes.length} stock quotes`;
    }
    return "Getting stock quote\u2026";
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <IntegrationProviderIcon
        provider="yahoo_finance"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});

export const YFinanceChartTool = memo(function YFinanceChartTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as ChartOutput) : null;
  const input =
    "input" in part
      ? (part.input as { symbol?: string; range?: string })
      : null;

  const canOpen = Boolean(output && output.dataPoints.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.dataPoints.length === 0) return;
    open(
      <YFinanceChartSidebar
        symbol={output.symbol}
        dataPoints={output.dataPoints}
      />,
    );
  }, [open, output]);

  const label = (() => {
    if (isError) return "Failed to get chart data";
    if (isRunning) {
      return input?.symbol
        ? `Getting ${input.range ?? ""} chart for ${input.symbol}`
        : "Getting chart data\u2026";
    }
    if (output) {
      return `${output.symbol} chart \u2014 ${output.totalPoints} data points`;
    }
    return "Getting chart data\u2026";
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <IntegrationProviderIcon
        provider="yahoo_finance"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});

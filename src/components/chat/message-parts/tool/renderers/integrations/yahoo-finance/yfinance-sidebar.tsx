"use client";

import { memo, useCallback, useState } from "react";
import {
  ArrowLeft02Icon,
  ChartLineData02Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Chip, CloseButton, ScrollShadow, Separator } from "@heroui/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { useRightSidebar } from "@/components/shell/shell-context";

type QuoteResult = {
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
};

type SearchResult = {
  symbol: string;
  shortname: string;
  longname: string | null;
  exchDisp: string;
  typeDisp: string;
};

type ChartPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function formatPrice(value: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLargeNumber(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatVolume(value: number): string {
  return formatLargeNumber(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[11.5px]">
      <span className="text-foreground/40">{label}</span>
      <span className="text-foreground/70 tabular-nums">{value}</span>
    </div>
  );
}

function QuoteCard({
  quote,
  onSelect,
}: {
  quote: QuoteResult;
  onSelect: (quote: QuoteResult) => void;
}) {
  const isPositive = quote.regularMarketChange >= 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(quote)}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-foreground/4"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-[11px] font-medium text-foreground/60">
        {quote.symbol.slice(0, 3)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {quote.symbol}
          </span>
          <span className="truncate text-[11px] text-foreground/35">
            {quote.shortName}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-foreground/40">
          {quote.exchange}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums text-foreground">
          {formatPrice(quote.regularMarketPrice, quote.currency)}
        </p>
        <p
          className={`text-[11px] tabular-nums ${isPositive ? "text-success" : "text-danger"}`}
        >
          {isPositive ? "+" : ""}
          {quote.regularMarketChange.toFixed(2)} (
          {formatPercent(quote.regularMarketChangePercent)})
        </p>
      </div>
    </button>
  );
}

function QuoteDetailView({ quote }: { quote: QuoteResult }) {
  const isPositive = quote.regularMarketChange >= 0;

  return (
    <ScrollShadow className="h-full" orientation="vertical">
      <div className="space-y-4 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-medium text-foreground">
              {quote.symbol}
            </h3>
            <Chip
              size="sm"
              variant="soft"
              color={quote.marketState === "REGULAR" ? "success" : "default"}
            >
              {quote.marketState === "REGULAR" ? "Open" : quote.marketState}
            </Chip>
          </div>
          <p className="mt-0.5 text-[12px] text-foreground/45">
            {quote.longName ?? quote.shortName} &middot; {quote.exchange}
          </p>
        </div>

        <div>
          <p className="text-[22px] font-medium tabular-nums text-foreground">
            {formatPrice(quote.regularMarketPrice, quote.currency)}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <HugeiconsIcon
              icon={isPositive ? ArrowUp01Icon : ArrowDown01Icon}
              size={13}
              strokeWidth={2}
              className={isPositive ? "text-success" : "text-danger"}
            />
            <span
              className={`text-[12.5px] tabular-nums font-medium ${isPositive ? "text-success" : "text-danger"}`}
            >
              {isPositive ? "+" : ""}
              {quote.regularMarketChange.toFixed(2)} (
              {formatPercent(quote.regularMarketChangePercent)})
            </span>
          </div>
        </div>

        <Separator variant="tertiary" />

        <div className="space-y-2">
          <MetaRow
            label="Open"
            value={formatPrice(quote.regularMarketOpen, quote.currency)}
          />
          <MetaRow
            label="Previous Close"
            value={formatPrice(
              quote.regularMarketPreviousClose,
              quote.currency,
            )}
          />
          <MetaRow
            label="Day Range"
            value={`${formatPrice(quote.regularMarketDayLow, quote.currency)} – ${formatPrice(quote.regularMarketDayHigh, quote.currency)}`}
          />
          <MetaRow
            label="52W Range"
            value={`${formatPrice(quote.fiftyTwoWeekLow, quote.currency)} – ${formatPrice(quote.fiftyTwoWeekHigh, quote.currency)}`}
          />
          <MetaRow
            label="Volume"
            value={formatVolume(quote.regularMarketVolume)}
          />
          {quote.marketCap ? (
            <MetaRow
              label="Market Cap"
              value={formatLargeNumber(quote.marketCap)}
            />
          ) : null}
          <MetaRow label="Currency" value={quote.currency} />
        </div>
      </div>
    </ScrollShadow>
  );
}

function SidebarHeader({
  title,
  subtitle,
  selectedQuote,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  selectedQuote: QuoteResult | null;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-2">
      {selectedQuote ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl cursor-pointer text-foreground/50 transition-colors bg-background/50 border border-border/20 hover:text-foreground"
          aria-label="Back to results"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <IntegrationProviderIcon
          provider="yahoo_finance"
          className="h-4 w-4 shrink-0 ml-2"
        />
      )}

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {selectedQuote ? selectedQuote.symbol : title}
      </span>

      {subtitle && !selectedQuote ? (
        <span className="shrink-0 text-[11px] text-foreground/35">
          {subtitle}
        </span>
      ) : null}

      <CloseButton aria-label="Close sidebar" onPress={onClose} />
    </header>
  );
}

export const YFinanceSearchSidebar = memo(function YFinanceSearchSidebar({
  query,
  results,
}: {
  query: string;
  results: SearchResult[];
}) {
  const { close } = useRightSidebar();

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider="yahoo_finance"
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          Yahoo Finance
        </span>
        <span className="shrink-0 text-[11px] text-foreground/35">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </span>
        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      {results.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
            <HugeiconsIcon
              icon={ChartLineData02Icon}
              size={18}
              strokeWidth={1.6}
              className="text-foreground/30"
            />
          </div>
          <p className="text-[13px] font-medium text-foreground/50">
            No results for &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
          <div className="flex flex-col">
            {results.map((result, index) => (
              <div key={result.symbol}>
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-[11px] font-medium text-foreground/60">
                    {result.symbol.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-foreground">
                        {result.symbol}
                      </span>
                      <Chip size="sm" variant="tertiary">
                        {result.typeDisp}
                      </Chip>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-foreground/40">
                      {result.longname ?? result.shortname} &middot;{" "}
                      {result.exchDisp}
                    </p>
                  </div>
                </div>
                {index < results.length - 1 ? (
                  <Separator className="my-0.5 ml-14" variant="tertiary" />
                ) : null}
              </div>
            ))}
          </div>
        </ScrollShadow>
      )}
    </div>
  );
});

export const YFinanceQuoteSidebar = memo(function YFinanceQuoteSidebar({
  quotes,
}: {
  quotes: QuoteResult[];
}) {
  const { close } = useRightSidebar();
  const [selectedQuote, setSelectedQuote] = useState<QuoteResult | null>(
    quotes.length === 1 ? quotes[0]! : null,
  );

  const handleBack = useCallback(() => setSelectedQuote(null), []);

  const isSingle = quotes.length === 1;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <SidebarHeader
        title="Stock Quotes"
        subtitle={
          !isSingle
            ? `${quotes.length} quote${quotes.length !== 1 ? "s" : ""}`
            : undefined
        }
        selectedQuote={!isSingle ? selectedQuote : null}
        onBack={handleBack}
        onClose={close}
      />
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        {selectedQuote || isSingle ? (
          <QuoteDetailView quote={selectedQuote ?? quotes[0]!} />
        ) : (
          <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
            <div className="flex flex-col">
              {quotes.map((quote, index) => (
                <div key={quote.symbol}>
                  <QuoteCard quote={quote} onSelect={setSelectedQuote} />
                  {index < quotes.length - 1 ? (
                    <Separator className="my-0.5 ml-14" variant="tertiary" />
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollShadow>
        )}
      </div>
    </div>
  );
});

export const YFinanceChartSidebar = memo(function YFinanceChartSidebar({
  symbol,
  dataPoints,
}: {
  symbol: string;
  dataPoints: ChartPoint[];
}) {
  const { close } = useRightSidebar();

  const first = dataPoints[0];
  const last = dataPoints[dataPoints.length - 1];
  const change = first && last ? last.close - first.open : 0;
  const changePct = first && first.open !== 0 ? (change / first.open) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider="yahoo_finance"
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {symbol} Chart
        </span>
        <span className="shrink-0 text-[11px] text-foreground/35">
          {dataPoints.length} points
        </span>
        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      <div className="shrink-0 px-4 py-3 space-y-1">
        {last ? (
          <p className="text-[18px] font-medium tabular-nums text-foreground">
            {formatPrice(last.close)}
          </p>
        ) : null}
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={isPositive ? ArrowUp01Icon : ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className={isPositive ? "text-success" : "text-danger"}
          />
          <span
            className={`text-[12px] tabular-nums font-medium ${isPositive ? "text-success" : "text-danger"}`}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(2)} ({formatPercent(changePct)})
          </span>
        </div>
      </div>

      <Separator variant="tertiary" />

      <ScrollShadow className="h-full" orientation="vertical">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-foreground/40 border-b border-border/20">
              <th className="px-3 py-1.5 text-left font-medium">Date</th>
              <th className="px-2 py-1.5 text-right font-medium">Open</th>
              <th className="px-2 py-1.5 text-right font-medium">High</th>
              <th className="px-2 py-1.5 text-right font-medium">Low</th>
              <th className="px-2 py-1.5 text-right font-medium">Close</th>
              <th className="px-3 py-1.5 text-right font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {dataPoints.map((point) => {
              const d = new Date(point.date);
              const label = d.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              return (
                <tr
                  key={point.date}
                  className="border-b border-border/10 text-foreground/65 tabular-nums"
                >
                  <td className="px-3 py-1.5 text-foreground/50">{label}</td>
                  <td className="px-2 py-1.5 text-right">
                    {point.open.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {point.high.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {point.low.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-foreground/80">
                    {point.close.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {formatVolume(point.volume)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollShadow>
    </div>
  );
});

import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { YahooFinanceService } from "./service";

export function buildYahooFinanceTools(
  _context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  const service = new YahooFinanceService();

  return {
    yfinance_get_quote: tool({
      description:
        "Get real-time stock quotes for one or more ticker symbols. Returns price, change, volume, market cap, and 52-week range.",
      inputSchema: z.object({
        symbols: z
          .array(z.string())
          .min(1)
          .max(10)
          .describe("Ticker symbols (e.g. ['AAPL', 'MSFT', 'GOOGL'])."),
      }),
      outputSchema: z.object({
        quotes: z.array(
          z.object({
            symbol: z.string(),
            shortName: z.string(),
            longName: z.string().nullable(),
            currency: z.string(),
            exchange: z.string(),
            marketState: z.string(),
            regularMarketPrice: z.number(),
            regularMarketChange: z.number(),
            regularMarketChangePercent: z.number(),
            regularMarketVolume: z.number(),
            regularMarketDayHigh: z.number(),
            regularMarketDayLow: z.number(),
            regularMarketOpen: z.number(),
            regularMarketPreviousClose: z.number(),
            fiftyTwoWeekHigh: z.number(),
            fiftyTwoWeekLow: z.number(),
            marketCap: z.number().nullable(),
          }),
        ),
      }),
      needsApproval: () => approvalFn("yfinance_get_quote"),
      execute: async (input) => {
        const quotes = await service.getQuote(input.symbols);
        return { quotes };
      },
    }),

    yfinance_search: tool({
      description:
        "Search Yahoo Finance for stocks, ETFs, mutual funds, and other securities by name or ticker.",
      inputSchema: z.object({
        query: z.string().describe("Search query (company name or ticker)."),
        maxResults: z
          .number()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum number of results."),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            symbol: z.string(),
            shortname: z.string(),
            longname: z.string().nullable(),
            exchDisp: z.string(),
            typeDisp: z.string(),
          }),
        ),
      }),
      needsApproval: () => approvalFn("yfinance_search"),
      execute: async (input) => {
        const results = await service.search(input.query, input.maxResults);
        return { results };
      },
    }),

    yfinance_get_chart: tool({
      description:
        "Get historical price data (OHLCV) for a stock. Useful for analyzing trends, creating charts, or comparing performance over time.",
      inputSchema: z.object({
        symbol: z.string().describe("Ticker symbol (e.g. 'AAPL')."),
        range: z
          .enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"])
          .default("1mo")
          .describe("Time range for the chart data."),
        interval: z
          .enum([
            "1m",
            "5m",
            "15m",
            "30m",
            "1h",
            "1d",
            "1wk",
            "1mo",
          ])
          .default("1d")
          .describe("Data interval granularity."),
      }),
      outputSchema: z.object({
        symbol: z.string(),
        dataPoints: z.array(
          z.object({
            date: z.string(),
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            volume: z.number(),
          }),
        ),
        totalPoints: z.number(),
      }),
      needsApproval: () => approvalFn("yfinance_get_chart"),
      execute: async (input) => {
        const points = await service.getChart(
          input.symbol,
          input.range,
          input.interval,
        );
        return {
          symbol: input.symbol.toUpperCase(),
          dataPoints: points,
          totalPoints: points.length,
        };
      },
    }),
  };
}

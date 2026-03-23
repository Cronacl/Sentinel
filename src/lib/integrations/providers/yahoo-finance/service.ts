import "server-only";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance";
const YF_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search";
const YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

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

async function yfFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export class YahooFinanceService {
  async getQuote(symbols: string[]): Promise<QuoteResult[]> {
    const joined = symbols.map((s) => s.toUpperCase()).join(",");
    const url = `${YF_BASE}/quote?symbols=${encodeURIComponent(joined)}`;

    const data = await yfFetch<{
      quoteResponse: { result: Record<string, unknown>[] };
    }>(url);

    return data.quoteResponse.result.map((q) => ({
      symbol: String(q.symbol ?? ""),
      shortName: String(q.shortName ?? ""),
      longName: q.longName ? String(q.longName) : null,
      currency: String(q.currency ?? "USD"),
      exchange: String(q.fullExchangeName ?? q.exchange ?? ""),
      marketState: String(q.marketState ?? ""),
      regularMarketPrice: Number(q.regularMarketPrice ?? 0),
      regularMarketChange: Number(q.regularMarketChange ?? 0),
      regularMarketChangePercent: Number(q.regularMarketChangePercent ?? 0),
      regularMarketVolume: Number(q.regularMarketVolume ?? 0),
      regularMarketDayHigh: Number(q.regularMarketDayHigh ?? 0),
      regularMarketDayLow: Number(q.regularMarketDayLow ?? 0),
      regularMarketOpen: Number(q.regularMarketOpen ?? 0),
      regularMarketPreviousClose: Number(q.regularMarketPreviousClose ?? 0),
      fiftyTwoWeekHigh: Number(q.fiftyTwoWeekHigh ?? 0),
      fiftyTwoWeekLow: Number(q.fiftyTwoWeekLow ?? 0),
      marketCap: q.marketCap ? Number(q.marketCap) : null,
    }));
  }

  async search(query: string, count = 10): Promise<SearchResult[]> {
    const url = `${YF_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=${count}&newsCount=0`;

    const data = await yfFetch<{
      quotes: Record<string, unknown>[];
    }>(url);

    return (data.quotes ?? []).map((q) => ({
      symbol: String(q.symbol ?? ""),
      shortname: String(q.shortname ?? ""),
      longname: q.longname ? String(q.longname) : null,
      exchDisp: String(q.exchDisp ?? ""),
      typeDisp: String(q.typeDisp ?? ""),
    }));
  }

  async getChart(
    symbol: string,
    range: string,
    interval: string,
  ): Promise<ChartPoint[]> {
    const url = `${YF_CHART}/${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=${interval}`;

    const data = await yfFetch<{
      chart: {
        result: {
          timestamp: number[];
          indicators: {
            quote: {
              open: (number | null)[];
              high: (number | null)[];
              low: (number | null)[];
              close: (number | null)[];
              volume: (number | null)[];
            }[];
          };
        }[];
      };
    }>(url);

    const result = data.chart.result[0];
    if (!result?.timestamp) return [];

    const quote = result.indicators.quote[0]!;
    return result.timestamp.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString(),
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }));
  }
}

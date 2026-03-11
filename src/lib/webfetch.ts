export const DEFAULT_WEBFETCH_BATCH_ENABLED = false;
export const DEFAULT_WEBFETCH_BATCH_LIMIT = 10;
export const MIN_WEBFETCH_BATCH_LIMIT = 1;
export const MAX_WEBFETCH_BATCH_LIMIT = 50;

export type WebFetchSettings = {
  batchEnabled: boolean;
  batchLimit: number;
};

export function normalizeWebFetchBatchLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WEBFETCH_BATCH_LIMIT;
  }

  return Math.min(
    MAX_WEBFETCH_BATCH_LIMIT,
    Math.max(MIN_WEBFETCH_BATCH_LIMIT, Math.floor(value)),
  );
}

export function normalizeWebFetchSettings(
  value:
    | Partial<WebFetchSettings>
    | {
        webFetchBatchEnabled?: boolean | null;
        webFetchBatchLimit?: number | null;
      }
    | null
    | undefined,
): WebFetchSettings {
  const candidate = (value ?? {}) as {
    batchEnabled?: boolean;
    batchLimit?: number;
    webFetchBatchEnabled?: boolean | null;
    webFetchBatchLimit?: number | null;
  };

  return {
    batchEnabled:
      candidate.batchEnabled ??
      candidate.webFetchBatchEnabled ??
      DEFAULT_WEBFETCH_BATCH_ENABLED,
    batchLimit: normalizeWebFetchBatchLimit(
      candidate.batchLimit ?? candidate.webFetchBatchLimit,
    ),
  };
}

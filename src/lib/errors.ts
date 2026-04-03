function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractObjectErrorMessage(
  value: unknown,
  seen: Set<unknown> = new Set(),
): string | null {
  if (value == null || typeof value !== "object" || seen.has(value)) {
    return null;
  }

  seen.add(value);

  if (value instanceof Error) {
    if (
      isNonEmptyString(value.message) &&
      value.message.trim() !== "[object Object]"
    ) {
      return value.message;
    }

    return extractObjectErrorMessage(
      (value as Error & { cause?: unknown }).cause,
      seen,
    );
  }

  const candidate = value as {
    cause?: unknown;
    error?: unknown;
    message?: unknown;
  };

  if (
    isNonEmptyString(candidate.message) &&
    candidate.message.trim() !== "[object Object]"
  ) {
    return candidate.message;
  }

  return (
    extractObjectErrorMessage(candidate.error, seen) ??
    extractObjectErrorMessage(candidate.cause, seen)
  );
}

export function getErrorMessage(error: unknown, fallback?: string): string {
  const extracted = extractObjectErrorMessage(error);
  if (extracted) {
    return extracted;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback ?? String(error);
}

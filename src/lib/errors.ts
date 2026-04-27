function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractArrayErrorMessage(
  values: unknown,
  seen: Set<unknown>,
): string | null {
  if (!Array.isArray(values)) {
    return null;
  }

  const messages = values
    .map((value) =>
      typeof value === "string"
        ? value
        : extractObjectErrorMessage(value, seen),
    )
    .filter(isNonEmptyString);

  return messages.length > 0 ? messages.join("\n") : null;
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
    data?: unknown;
    description?: unknown;
    details?: unknown;
    error?: unknown;
    errors?: unknown;
    message?: unknown;
    reason?: unknown;
    response?: unknown;
    statusText?: unknown;
  };

  if (
    isNonEmptyString(candidate.message) &&
    candidate.message.trim() !== "[object Object]"
  ) {
    return candidate.message;
  }

  for (const field of [
    candidate.description,
    candidate.details,
    candidate.reason,
    candidate.statusText,
  ]) {
    if (isNonEmptyString(field) && field.trim() !== "[object Object]") {
      return field;
    }
  }

  const arrayMessage = extractArrayErrorMessage(candidate.errors, seen);
  if (arrayMessage) {
    return arrayMessage;
  }

  return (
    extractObjectErrorMessage(candidate.error, seen) ??
    extractObjectErrorMessage(candidate.cause, seen) ??
    extractObjectErrorMessage(candidate.response, seen) ??
    extractObjectErrorMessage(candidate.data, seen)
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

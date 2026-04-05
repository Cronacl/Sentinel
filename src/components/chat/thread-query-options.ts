import type { RouterOutputs } from "@/trpc/react";

type ThreadDetails = RouterOutputs["threads"]["get"];

export function buildThreadQueryOptions<T extends ThreadDetails>(
  cachedThread?: T,
): {
  initialData?: T;
  placeholderData: () => undefined;
} {
  return {
    ...(cachedThread ? { initialData: cachedThread } : {}),
    placeholderData: () => undefined,
  };
}

import type { RouterOutputs } from "@/trpc/react";

type ThreadDetails = RouterOutputs["threads"]["get"];

export function buildThreadQueryOptions(cachedThread?: ThreadDetails): {
  initialData?: ThreadDetails;
  placeholderData: () => undefined;
} {
  return {
    ...(cachedThread ? { initialData: cachedThread } : {}),
    placeholderData: () => undefined,
  };
}

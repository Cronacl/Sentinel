import type { RouterOutputs } from "@/trpc/react";

type ThreadDetails = RouterOutputs["threads"]["get"];

export function buildThreadQueryOptions<T extends ThreadDetails>(
  cachedThread?: T,
  options: { refreshOnMount?: boolean } = {},
): {
  initialData?: T;
  placeholderData: () => undefined;
  refetchOnMount?: "always";
} {
  return {
    ...(cachedThread ? { initialData: cachedThread } : {}),
    placeholderData: () => undefined,
    ...(options.refreshOnMount ? { refetchOnMount: "always" as const } : {}),
  };
}

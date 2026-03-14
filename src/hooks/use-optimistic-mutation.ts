"use client";

import { useMemo } from "react";

type OptimisticMutationContext<TCache> = {
  previousData: TCache | undefined;
};

type UseOptimisticMutationOptions<TInput, TData, TCache, TError> = {
  applyOptimisticUpdate: (
    current: TCache | undefined,
    input: TInput,
  ) => TCache | undefined;
  getData: () => TCache | undefined;
  onError?: (
    error: TError,
    input: TInput,
    context: OptimisticMutationContext<TCache>,
  ) => void;
  onSuccess?: (
    data: TData,
    input: TInput,
    context: OptimisticMutationContext<TCache>,
  ) => void;
  setData: (value: TCache | undefined) => void;
};

export function useOptimisticMutation<TInput, TData, TCache, TError = Error>({
  applyOptimisticUpdate,
  getData,
  onError,
  onSuccess,
  setData,
}: UseOptimisticMutationOptions<TInput, TData, TCache, TError>) {
  return useMemo(
    () => ({
      onError: (
        error: TError,
        input: TInput,
        context?: OptimisticMutationContext<TCache>,
      ) => {
        const resolvedContext = {
          previousData: context?.previousData,
        } satisfies OptimisticMutationContext<TCache>;

        setData(resolvedContext.previousData);
        onError?.(error, input, resolvedContext);
      },
      onMutate: async (input: TInput) => {
        const previousData = getData();
        setData(applyOptimisticUpdate(previousData, input));

        return {
          previousData,
        } satisfies OptimisticMutationContext<TCache>;
      },
      onSuccess: (
        data: TData,
        input: TInput,
        context?: OptimisticMutationContext<TCache>,
      ) => {
        onSuccess?.(data, input, {
          previousData: context?.previousData,
        });
      },
    }),
    [applyOptimisticUpdate, getData, onError, onSuccess, setData],
  );
}

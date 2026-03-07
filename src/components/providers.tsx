"use client";

import type { PropsWithChildren } from "react";

import { ThemeSync } from "@/components/theme/theme-sync";
import { TRPCReactProvider } from "@/trpc/react";

export function Providers({ children }: PropsWithChildren) {
  return (
    <TRPCReactProvider>
      <ThemeSync />
      {children}
    </TRPCReactProvider>
  );
}

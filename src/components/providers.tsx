"use client";

import type { PropsWithChildren } from "react";

import { TRPCReactProvider } from "@/trpc/react";

export function Providers({ children }: PropsWithChildren) {
	return <TRPCReactProvider>{children}</TRPCReactProvider>;
}

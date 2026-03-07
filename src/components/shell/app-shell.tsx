"use client";

import type { PropsWithChildren } from "react";

import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";
import { ShellProvider } from "./shell-context";
import { SidebarToggle } from "./sidebar-toggle";

export function AppShell({ children }: PropsWithChildren) {
	return (
		<ShellProvider>
			<div className="flex h-dvh overflow-hidden">
				<LeftSidebar>
					<div className="flex h-14 shrink-0 items-center px-4">
						<SidebarToggle />
					</div>
				</LeftSidebar>

				<main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
					{children}
				</main>

				<RightSidebar />
			</div>
		</ShellProvider>
	);
}

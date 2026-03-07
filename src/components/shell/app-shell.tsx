"use client";

import { Button } from "@heroui/react";
import {
  ArrowLeft01Icon,
  Brain02Icon,
  Settings01Icon,
  Settings05Icon,
  TestTubeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";

import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";
import { ShellProvider } from "./shell-context";
import { SidebarToggle } from "./sidebar-toggle";

const SETTINGS_NAV = [
  { href: "/settings", label: "General", icon: Settings05Icon },
  { href: "/settings/providers", label: "Providers", icon: TestTubeIcon },
  { href: "/settings/models", label: "Models", icon: Brain02Icon },
] as const;

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const isSettings = pathname.startsWith("/settings");

  if (isSettings) {
    const isActive = (href: string) =>
      href === "/settings"
        ? pathname === "/settings"
        : pathname.startsWith(href);

    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-3 pt-3 pb-1">
          <Link
            className="text-muted hover:text-foreground inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
            href="/"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={14}
              strokeWidth={1.5}
            />
            Back to app
          </Link>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 pt-1">
          {SETTINGS_NAV.map((item) => (
            <Button
              key={item.href}
              size="sm"
              fullWidth
              variant={isActive(item.href) ? "tertiary" : "ghost"}
              className="justify-start rounded-lg"
              onPress={() => router.push(item.href)}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={item.icon}
                size={15}
                strokeWidth={1.5}
              />
              {item.label}
            </Button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <SidebarToggle />
      </div>

      <div className="flex-1" />

      <div className="shrink-0 px-3 pb-3">
        <Button
          size="sm"
          fullWidth
          variant="ghost"
          className="justify-start rounded-lg"
          onPress={() => router.push("/settings")}
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Settings01Icon}
            size={15}
            strokeWidth={1.5}
          />
          Settings
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  return (
    <ShellProvider>
      <div className="flex h-dvh overflow-hidden">
        <LeftSidebar>
          <SidebarContent />
        </LeftSidebar>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>

        <RightSidebar />
      </div>
    </ShellProvider>
  );
}

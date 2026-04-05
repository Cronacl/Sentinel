"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import { ShortcutProvider, useShortcutAction } from "@/lib/shortcuts/provider";
import { api } from "@/trpc/react";

import { SETTINGS_NAV } from "@/components/settings/settings-nav";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

import { WorkspaceSidebar } from "./workspace-sidebar";
import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";
import { AppWarmupCoordinator } from "./app-warmup";
import { ShellProvider, useShell } from "./shell-context";
import { useAppShortcutActions } from "./use-app-shortcut-actions";
import { DesktopTitleBar, SidebarWindowChrome } from "./sidebar-window-chrome";

function ShellWarmCache() {
  api.workspaces.getCurrent.useQuery();
  api.workspaces.list.useQuery();
  api.workspaces.getPreferences.useQuery();

  return null;
}

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
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 pb-1">
          <Link
            className="text-muted hover:text-foreground inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
            href="/"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft02Icon}
              size={14}
              strokeWidth={1.5}
            />
            Back to app
          </Link>
        </div>

        <ScrollShadow
          className="min-h-0 flex-1 px-3 pt-1 pb-3"
          hideScrollBar
          orientation="vertical"
        >
          <nav className="flex flex-col gap-0.5">
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
        </ScrollShadow>
      </div>
    );
  }

  return <WorkspaceSidebar />;
}

function AppShellShortcutBindings() {
  const { toggleLeftSidebar } = useShell();
  const {
    handleCreateWorkspace,
    handleOpenAutomations,
    handleOpenSettings,
    handleOpenSkills,
    handleStartNewThread,
  } = useAppShortcutActions();

  useShortcutAction("thread.new", handleStartNewThread);
  useShortcutAction("workspace.create", handleCreateWorkspace);
  useShortcutAction("automations.open", handleOpenAutomations);
  useShortcutAction("skills.open", handleOpenSkills);
  useShortcutAction("settings.open", handleOpenSettings);
  useShortcutAction("sidebar.left.toggle", toggleLeftSidebar);

  return null;
}

export function AppShell({ children }: PropsWithChildren) {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const showTitleBar = platform === "win32" || platform === "linux";

  return (
    <ShortcutProvider>
      <ShellProvider>
        <ShellWarmCache />
        <AppWarmupCoordinator />
        <AppShellShortcutBindings />
        <div className="flex h-dvh flex-col overflow-clip">
          {showTitleBar ? <DesktopTitleBar platform={platform!} /> : null}
          <div className="relative flex min-h-0 flex-1 overflow-clip">
            <LeftSidebar>
              <div className="flex h-full flex-col">
                <SidebarWindowChrome />
                <div className="min-h-0 flex-1">
                  <SidebarContent />
                </div>
              </div>
            </LeftSidebar>

            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
              <div className="min-h-0 flex-1">{children}</div>
              <TerminalPanel />
            </main>

            <RightSidebar />
          </div>
        </div>
      </ShellProvider>
    </ShortcutProvider>
  );
}

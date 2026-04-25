"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type PropsWithChildren, useEffect, useRef } from "react";

import { NewThreadScreen } from "@/components/chat/new-thread-screen";
import { getDesktopApi } from "@/lib/desktop/client";
import { ShortcutProvider, useShortcutAction } from "@/lib/shortcuts/provider";
import { api } from "@/trpc/react";

import { SETTINGS_NAV } from "@/components/settings/settings-nav";
import {
  closeTerminal,
  getTerminalDefaultCwd,
  toggleTerminalSession,
} from "@/components/terminal/terminal-store";

import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";
import { AppWarmupCoordinator } from "./app-warmup";
import { ShellProvider, useShell } from "./shell-context";
import { useAppShortcutActions } from "./use-app-shortcut-actions";
import {
  DesktopTitleBar,
  SidebarWindowChrome,
  hasDesktopTitleBar,
} from "./sidebar-window-chrome";

const ThreadRouteScreen = dynamic(
  () =>
    import("@/components/chat/thread-route-screen").then(
      (mod) => mod.ThreadRouteScreen,
    ),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center px-4" />
    ),
  },
);

const WorkspaceSidebar = dynamic(
  () =>
    import("@/components/shell/workspace-sidebar").then(
      (mod) => mod.WorkspaceSidebar,
    ),
  {
    loading: () => <div className="h-full" />,
  },
);

const TerminalPanel = dynamic(
  () =>
    import("@/components/terminal/terminal-panel").then(
      (mod) => mod.TerminalPanel,
    ),
  {
    loading: () => null,
  },
);

function ShellWarmCache() {
  api.workspaces.getCurrent.useQuery();
  api.workspaces.list.useQuery();
  api.workspaces.getPreferences.useQuery();

  return null;
}

function SidebarContent() {
  const router = useRouter();
  const { navigateHome, pathname } = useShell();
  const isSettings = pathname.startsWith("/settings");

  if (isSettings) {
    const isActive = (href: string) =>
      href === "/settings"
        ? pathname === "/settings"
        : pathname.startsWith(href);

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 pb-1">
          <button
            className="text-muted hover:text-foreground inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors"
            onClick={() => navigateHome()}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft02Icon}
              size={14}
              strokeWidth={1.5}
            />
            Back to app
          </button>
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
                className="justify-start rounded-xl"
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
  const currentWorkspace = api.workspaces.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
  });
  const {
    handleCreateWorkspace,
    handleOpenAutomations,
    handleOpenScratchpad,
    handleOpenSettings,
    handleOpenSkills,
    handleStartNewThread,
  } = useAppShortcutActions();

  useShortcutAction("thread.new", handleStartNewThread);
  useShortcutAction("workspace.create", handleCreateWorkspace);
  useShortcutAction("automations.open", handleOpenAutomations);
  useShortcutAction("scratchpad.open", handleOpenScratchpad);
  useShortcutAction("skills.open", handleOpenSkills);
  useShortcutAction("settings.open", handleOpenSettings);
  useShortcutAction("sidebar.left.toggle", toggleLeftSidebar);
  useShortcutAction("terminal.toggle", () => {
    void toggleTerminalSession(
      getTerminalDefaultCwd() ?? currentWorkspace.data?.rootPath ?? null,
    );
  });

  return null;
}

function AppShellRouteEffects() {
  const { pathname } = useShell();
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousPathnameRef.current == null) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current !== pathname) {
      closeTerminal();
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

  return null;
}

function AppShellContent({ children }: PropsWithChildren) {
  const { isHomeRoute, isThreadRoute, selectedThreadId } = useShell();

  if (isThreadRoute && selectedThreadId) {
    return <ThreadRouteScreen threadId={selectedThreadId} />;
  }

  if (isHomeRoute) {
    return <NewThreadScreen variant="project" />;
  }

  return <>{children}</>;
}

export function AppShell({ children }: PropsWithChildren) {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const showTitleBar = hasDesktopTitleBar(platform);

  return (
    <ShortcutProvider>
      <ShellProvider>
        <ShellWarmCache />
        <AppWarmupCoordinator />
        <AppShellShortcutBindings />
        <AppShellRouteEffects />
        <div className="flex h-dvh flex-col overflow-clip">
          {showTitleBar && platform ? (
            <DesktopTitleBar platform={platform} />
          ) : null}
          <div className="relative flex min-h-0 flex-1 overflow-clip">
            <LeftSidebar>
              <div className="flex h-full flex-col">
                <SidebarWindowChrome />
                <div className="min-h-0 flex-1">
                  <SidebarContent />
                </div>
              </div>
            </LeftSidebar>

            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-background">
              <div className="min-h-0 flex-1">
                <AppShellContent>{children}</AppShellContent>
              </div>
              <TerminalPanel />
            </main>

            <RightSidebar />
          </div>
        </div>
      </ShellProvider>
    </ShortcutProvider>
  );
}

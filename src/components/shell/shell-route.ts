const THREAD_ROUTE_PATTERN = /^\/thread\/([^/?#]+)\/?$/;

export type ShellNavigationOptions = {
  replace?: boolean;
};

export type ShellRouteState = {
  isHomeRoute: boolean;
  isThreadRoute: boolean;
  pathname: string;
  selectedThreadId: string | null;
};

export function resolveShellRouteState(pathname: string): ShellRouteState {
  const threadMatch = pathname.match(THREAD_ROUTE_PATTERN);

  return {
    isHomeRoute: pathname === "/",
    isThreadRoute: threadMatch != null,
    pathname,
    selectedThreadId: threadMatch?.[1] ?? null,
  };
}

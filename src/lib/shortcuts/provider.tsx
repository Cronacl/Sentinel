"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import { api } from "@/trpc/react";

import {
  getDefaultShortcutBindings,
  getShortcutLabel,
  mergeShortcutBindings,
} from "./registry";
import {
  resolveShortcutDispatch,
  type RegisteredShortcutHandler,
  type RegisteredShortcutScope,
} from "./runtime";
import {
  type ShortcutActionId,
  type ShortcutPlatform,
  type ShortcutScopeKind,
} from "./schema";

type ShortcutContextValue = {
  getShortcutLabel: (actionId: ShortcutActionId) => string | null;
  getShortcutPlatform: () => ShortcutPlatform;
  registerHandler: (
    input: Omit<RegisteredShortcutHandler, "order">,
  ) => () => void;
  registerScope: (input: Omit<RegisteredShortcutScope, "order">) => () => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

function resolveShortcutPlatform(): ShortcutPlatform {
  const desktopPlatform = getDesktopApi()?.app.platform;
  if (desktopPlatform) {
    return desktopPlatform;
  }

  if (typeof navigator === "undefined") {
    return "linux";
  }

  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) {
    return "darwin";
  }

  if (platform.includes("win")) {
    return "win32";
  }

  return "linux";
}

export function ShortcutProvider({ children }: PropsWithChildren) {
  const platform = resolveShortcutPlatform();
  const query = api.shortcuts.get.useQuery(
    { platform },
    {
      staleTime: 60_000,
    },
  );

  const effectiveBindings = useMemo(
    () => query.data?.effectiveBindings ?? getDefaultShortcutBindings(platform),
    [platform, query.data?.effectiveBindings],
  );

  const scopesRef = useRef(new Map<string, RegisteredShortcutScope>());
  const handlersRef = useRef(new Map<string, RegisteredShortcutHandler>());
  const orderRef = useRef(0);

  const registerScope = useCallback(
    (input: Omit<RegisteredShortcutScope, "order">) => {
      const entry: RegisteredShortcutScope = {
        ...input,
        order: ++orderRef.current,
      };
      scopesRef.current.set(input.id, entry);

      return () => {
        scopesRef.current.delete(input.id);
      };
    },
    [],
  );

  const registerHandler = useCallback(
    (input: Omit<RegisteredShortcutHandler, "order">) => {
      const entry: RegisteredShortcutHandler = {
        ...input,
        order: ++orderRef.current,
      };
      handlersRef.current.set(input.id, entry);

      return () => {
        handlersRef.current.delete(input.id);
      };
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const candidate = resolveShortcutDispatch({
        bindings: effectiveBindings,
        event,
        handlers: [...handlersRef.current.values()],
        platform,
        scopes: [...scopesRef.current.values()],
      });

      if (!candidate) {
        return;
      }

      event.preventDefault();
      candidate.handler.run();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [effectiveBindings, platform]);

  const value = useMemo<ShortcutContextValue>(
    () => ({
      getShortcutLabel: (actionId) =>
        getShortcutLabel(actionId, platform, effectiveBindings),
      getShortcutPlatform: () => platform,
      registerHandler,
      registerScope,
    }),
    [effectiveBindings, platform, registerHandler, registerScope],
  );

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  );
}

export function useShortcuts() {
  const context = useContext(ShortcutContext);
  if (!context) {
    throw new Error("useShortcuts must be used within ShortcutProvider");
  }

  return context;
}

export function useShortcutLabel(actionId: ShortcutActionId) {
  const { getShortcutLabel } = useShortcuts();
  return getShortcutLabel(actionId);
}

export function useShortcutScope(input: {
  active?: boolean;
  kind: ShortcutScopeKind;
}) {
  const { registerScope } = useShortcuts();
  const scopeId = useId();

  useEffect(() => {
    return registerScope({
      active: input.active ?? true,
      id: scopeId,
      kind: input.kind,
    });
  }, [input.active, input.kind, registerScope, scopeId]);

  return useMemo(
    () => ({
      id: scopeId,
      kind: input.kind,
    }),
    [input.kind, scopeId],
  );
}

export function useShortcutAction(
  actionId: ShortcutActionId,
  handler: () => void,
  options?: {
    enabled?: boolean;
    scopeId?: string;
  },
) {
  const { registerHandler } = useShortcuts();
  const handlerId = useId();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return registerHandler({
      actionId,
      enabled: options?.enabled ?? true,
      id: handlerId,
      run: () => handlerRef.current(),
      scopeId: options?.scopeId,
    });
  }, [
    actionId,
    handlerId,
    options?.enabled,
    options?.scopeId,
    registerHandler,
  ]);
}

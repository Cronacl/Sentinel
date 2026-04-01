import {
  SHORTCUT_SCOPE_PRIORITY,
  getShortcutDefinition,
  matchesShortcutEvent,
} from "./registry";
import type {
  ShortcutActionId,
  ShortcutBindingsMap,
  ShortcutPlatform,
  ShortcutScopeKind,
} from "./schema";

export type RegisteredShortcutScope = {
  active: boolean;
  id: string;
  kind: ShortcutScopeKind;
  order: number;
};

export type RegisteredShortcutHandler = {
  actionId: ShortcutActionId;
  enabled: boolean;
  id: string;
  order: number;
  run: () => void;
  scopeId?: string;
};

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const maybeElement = target as {
    closest?: (selector: string) => unknown;
    isContentEditable?: boolean;
    tagName?: string;
  };

  if (typeof maybeElement.closest === "function") {
    if (maybeElement.closest("[data-shortcuts-editable='false']")) {
      return false;
    }

    if (maybeElement.closest("[contenteditable='true']")) {
      return true;
    }
  }

  if (maybeElement.isContentEditable) {
    return true;
  }

  const tagName = maybeElement.tagName?.toLowerCase();
  return tagName === "input" || tagName === "select" || tagName === "textarea";
}

export function resolveShortcutDispatch(input: {
  bindings: ShortcutBindingsMap;
  event: Pick<
    KeyboardEvent,
    | "altKey"
    | "ctrlKey"
    | "defaultPrevented"
    | "isComposing"
    | "key"
    | "metaKey"
    | "shiftKey"
    | "target"
  >;
  handlers: RegisteredShortcutHandler[];
  platform: ShortcutPlatform;
  scopes: RegisteredShortcutScope[];
}) {
  if (input.event.defaultPrevented || input.event.isComposing) {
    return null;
  }

  const editableTarget = isEditableShortcutTarget(input.event.target ?? null);
  const activeScopes = new Map(
    input.scopes
      .filter((scope) => scope.active)
      .map((scope) => [scope.id, scope]),
  );

  const candidates = input.handlers
    .filter((handler) => handler.enabled)
    .map((handler) => {
      const definition = getShortcutDefinition(handler.actionId);
      if (editableTarget && !definition.allowInEditable) {
        return null;
      }

      if (handler.scopeId) {
        const scope = activeScopes.get(handler.scopeId);
        if (!scope) {
          return null;
        }

        return {
          actionId: handler.actionId,
          handler,
          scope,
        };
      }

      return {
        actionId: handler.actionId,
        handler,
        scope: null,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        actionId: ShortcutActionId;
        handler: RegisteredShortcutHandler;
        scope: RegisteredShortcutScope | null;
      } => candidate != null,
    )
    .filter((candidate) => {
      const chords = input.bindings[candidate.actionId] ?? [];
      return chords.some((chord) =>
        matchesShortcutEvent(chord, input.event, input.platform),
      );
    })
    .sort((left, right) => {
      const leftPriority = left.scope
        ? SHORTCUT_SCOPE_PRIORITY[left.scope.kind]
        : SHORTCUT_SCOPE_PRIORITY.global;
      const rightPriority = right.scope
        ? SHORTCUT_SCOPE_PRIORITY[right.scope.kind]
        : SHORTCUT_SCOPE_PRIORITY.global;

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      const leftScopeOrder = left.scope?.order ?? 0;
      const rightScopeOrder = right.scope?.order ?? 0;
      if (leftScopeOrder !== rightScopeOrder) {
        return rightScopeOrder - leftScopeOrder;
      }

      return right.handler.order - left.handler.order;
    });

  return candidates[0] ?? null;
}
